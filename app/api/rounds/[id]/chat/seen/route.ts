import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { threadSeenKey } from '@/lib/roundUnread';

// POST /api/rounds/[id]/chat/seen { at, threadId? } … 本流（threadId なし）かそのスレッドを グループチャットをここまで見た（2026-10-12）。
// 「💬 新着」を端末をまたいで消すため users.roundChatSeen[募集] に時刻を残す（新しい時刻のときだけ書く）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const at = Math.min(Date.now(), Number(body.at) || Date.now());
  const adb = getAdminDb() as any;
  const tid = typeof body.threadId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.threadId) ? body.threadId : '';
  const participant = round.hostId === meId || (round.coHostIds || []).includes(meId) || (round.applicantIds || []).includes(meId);
  if (!participant) {
    // 参加者でない人は、自分が入っている非公開の質問スレッドだけ既読にできる（2026-10-13・lib/roundQuestion）
    if (!tid) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    const threads = await db.listRoundThreads(params.id);
    const t = threads.find((x) => x.id === tid);
    if (!t || !(t.memberIds || []).includes(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const key = tid ? threadSeenKey(params.id, tid) : params.id;
  if (adb) {
    const patch: Record<string, number> = { [key]: at };
    // 本流を既読にするとき、まだ自分の記録が無いスレッドには「これまでの本流の既読」を写しておく。
    // スレッドの既読は無ければ本流で代用するので、写さないとスレッドを開いていないのに既読になってしまう（2026-10-13）
    if (!tid) {
      const [uSnap, thSnap] = await Promise.all([
        adb.collection('users').doc(meId).get(),
        adb.collection('rounds').doc(params.id).collection('threads').limit(50).get().catch(() => ({ docs: [] })),
      ]);
      const cur: Record<string, number> = (uSnap.data() || {}).roundChatSeen || {};
      const oldMain = Number(cur[params.id]) || 0;
      for (const d of thSnap.docs) { const k = threadSeenKey(params.id, d.id); if (cur[k] == null) patch[k] = oldMain; }
    }
    await adb.collection('users').doc(meId).set({ roundChatSeen: patch }, { merge: true });
  }
  return NextResponse.json({ ok: true, at }, { headers: noStore });
}
