import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { computeRoundUnread, type RoundUnread } from '@/lib/roundUnread';

// POST /api/me/round-unread { localSeen?: { [募集ID]: ms } } … 参加中の募集のグループチャットの未読件数（2026-10-13・lib/roundUnread）
// 既読はサーバーの users.roundChatSeen（本流・スレッドごと）。この端末だけの古い記録（localSeen）は本流の既読の代わりにだけ使う。
// 対象：主催・参加確定の募集のうち、完了していないもの（＋完了から30日以内）。1募集あたり既読より新しい発言を最大200件まで読む。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ unread: {} }, { headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const local: Record<string, number> = body?.localSeen && typeof body.localSeen === 'object' ? body.localSeen : {};

  const [meSnap, hostSnap, joinSnap] = await Promise.all([
    adb.collection('users').doc(meId).get(),
    adb.collection('rounds').where('hostId', '==', meId).limit(200).get(),
    adb.collection('rounds').where('applicantIds', 'array-contains', meId).limit(200).get(),
  ]);
  const serverSeen: Record<string, number> = (meSnap.data() || {}).roundChatSeen || {};
  const cutoff = new Date(Date.now() + 9 * 3600 * 1000 - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const rounds = new Map<string, any>();
  for (const d of [...hostSnap.docs, ...joinSnap.docs]) {
    const r = d.data() || {};
    if (r.deleted || r.heldCancelledAt) continue;
    if (r.status === 'completed' && (!r.date || r.date < cutoff)) continue;
    rounds.set(d.id, r);
  }

  const unread: Record<string, RoundUnread> = {};
  await Promise.all(Array.from(rounds.keys()).map(async (rid) => {
    try {
      const seen: Record<string, number> = {};
      for (const [k, v] of Object.entries(serverSeen)) if (k === rid || k.startsWith(rid + '__')) seen[k] = Number(v) || 0;
      seen[rid] = Math.max(seen[rid] || 0, Number(local[rid]) || 0);
      const minSeen = Math.min(...Object.values(seen), seen[rid]);
      const ref = adb.collection('rounds').doc(rid);
      const [msgSnap, thSnap] = await Promise.all([
        ref.collection('chat').where('createdAt', '>', minSeen).orderBy('createdAt', 'asc').limit(200).get(),
        ref.collection('threads').limit(50).get().catch(() => ({ docs: [] })),
      ]);
      const msgs = msgSnap.docs.map((d: any) => d.data() || {});
      const threads = thSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
      const u = computeRoundUnread(rid, meId, msgs, threads, seen);
      if (u.total > 0) unread[rid] = u;
    } catch (e) { console.warn('[round-unread]', rid, (e as Error).message); }
  }));
  return NextResponse.json({ unread }, { headers: noStore });
}
