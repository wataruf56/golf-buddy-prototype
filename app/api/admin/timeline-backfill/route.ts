import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// POST /api/admin/timeline-backfill?token=XXX&days=30&dry=1 … タイムラインの「◯◯さんが「…」に参加しました」を過去にさかのぼって作る（2026-10-12）
// 参加の記録（_timelineEvents の join）は 2026-10-12 から書き始めたので、それより前の参加は残っていない。
// 「参加が確定した時刻」を、残っている記録から拾い直す（いちばん早いもの）：
//   ① 本人に届いたお知らせ：承認（applyApproved）／「参加者として追加されました」（知り合い枠の置き換え）… link が /round/<id>
//   ② 募集のチャットのシステムの1行：「👋 ◯◯さんが参加しました」（承認・空き待ちからの承認）
//   ③ 主催者に届いたお知らせ（applyReceived）で、本人の名前と「参加」を含むもの（招待の受諾）
// いまも参加している人だけ・その時刻が days 日以内のものだけ作る。すでに記録がある人はそのまま（上書きしない）。
// dry=1 なら書かずに一覧だけ返す。表示（タイムライン）は lib/timeline が時刻順に並べるので、間に差し込まれる。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 30)));
  const dry = url.searchParams.get('dry') === '1';
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const since = Date.now() - days * 86400000;

  // 参加者がいる募集（行ける日の部屋・運営の代理募集は対象外＝タイムラインにも出さない）
  const { ADMIN_MANAGER_ID } = await import('@/lib/adminManagerId');
  const snap = await adb.collection('rounds').limit(2000).get();
  const rounds = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((r: any) => !r.availDate && r.hostId !== ADMIN_MANAGER_ID && (r.applicantIds || []).length > 0 && (r.createdAt || 0) >= since - 60 * 86400000);

  const nameCache = new Map<string, string>();
  const nameOf = async (uid: string) => {
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const u = await adb.collection('users').doc(uid).get().catch(() => null);
    const n = String(u?.data()?.displayName || '');
    nameCache.set(uid, n);
    return n;
  };

  const rows: Array<{ roundId: string; title: string; userId: string; name: string; at: number; source: string; existed: boolean }> = [];
  for (const r of rounds) {
    const link = `/round/${r.id}`;
    const coHosts = new Set<string>(r.coHostIds || []);
    let chat: any[] = [];
    try { chat = (await adb.collection('rounds').doc(r.id).collection('chat').where('senderId', '==', 'system').limit(500).get()).docs.map((d: any) => d.data() || {}); } catch { /* noop */ }
    let hostNotes: any[] = [];
    try { hostNotes = (await adb.collection('users').doc(r.hostId).collection('notifications').where('link', '==', link).limit(200).get()).docs.map((d: any) => d.data() || {}); } catch { /* noop */ }
    for (const uid of Array.from(new Set<string>(r.applicantIds || []))) {
      if (coHosts.has(uid)) continue;   // 共同管理者は作成時から参加扱い（承認の出来事がない）
      const name = await nameOf(uid);
      const cands: Array<{ at: number; source: string }> = [];
      try {
        const ns = await adb.collection('users').doc(uid).collection('notifications').where('link', '==', link).limit(50).get();
        for (const d of ns.docs) {
          const x = d.data() || {};
          if (x.type === 'applyApproved') cands.push({ at: x.createdAt, source: '承認のお知らせ' });
          else if (x.type === 'invited' && String(x.text || '').includes('追加されました')) cands.push({ at: x.createdAt, source: '知り合い枠から追加' });
        }
      } catch { /* noop */ }
      if (name) {
        for (const m of chat) if (String(m.text || '').startsWith(`👋 ${name}さんが参加しました`)) cands.push({ at: m.createdAt, source: 'チャットの参加の1行' });
        for (const x of hostNotes) if (x.type === 'applyReceived' && String(x.text || '').includes(name) && String(x.text || '').includes('参加')) cands.push({ at: x.createdAt, source: '招待の受諾' });
      }
      const best = cands.filter((c) => Number(c.at) > 0).sort((a, b) => a.at - b.at)[0];
      if (!best || best.at < since) continue;
      const id = `join_${r.id}_${uid}`;
      const existed = (await adb.collection('_timelineEvents').doc(id).get()).exists;
      rows.push({ roundId: r.id, title: r.title || r.courseName || '', userId: uid, name, at: best.at, source: best.source, existed });
      if (!dry && !existed) await adb.collection('_timelineEvents').doc(id).set({ kind: 'join', roundId: r.id, userId: uid, at: best.at, backfilled: true });
    }
  }
  rows.sort((a, b) => a.at - b.at);
  return NextResponse.json({
    ok: true, dry, days, rounds: rounds.length,
    created: dry ? 0 : rows.filter((x) => !x.existed).length,
    found: rows.length,
    rows: rows.map((x) => ({ ...x, atJst: new Date(x.at + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') })),
  }, { headers: noStore });
}
