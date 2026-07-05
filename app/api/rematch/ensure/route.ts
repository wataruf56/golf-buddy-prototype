import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, saveSession, pairIdOf, mutualMatchKind } from '@/lib/rematch';

// POST /api/rematch/ensure  body: { partnerId }
// 「また回りたい」リストから直接、候補日調整を始めるための入口。相互マッチ済みなら
// 再会セッションを（無ければ）作成して pairId を返す。cron通知を待たずに開始できる。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const partnerId = String(body?.partnerId || '').trim();
  if (!partnerId || partnerId === meId) return NextResponse.json({ error: 'bad_partner' }, { status: 400, headers: noStore });

  const kind = await mutualMatchKind(meId, partnerId);
  if (!kind) return NextResponse.json({ error: 'not_matched' }, { status: 403, headers: noStore });

  const pairId = pairIdOf(meId, partnerId);
  const existing = await getSession(pairId);
  if (existing) return NextResponse.json({ ok: true, pairId }, { headers: noStore });

  // 文脈：2人が一緒だった直近の完了ラウンド（コース名・日付を通知/表示に使う）。
  let courseName = 'ゴルフ';
  let roundDate = '';
  let roundId = '';
  try {
    const completed = (await db.listRounds({ status: 'completed' }))
      .filter((r) => { const m = [r.hostId, ...(r.applicantIds || [])]; return m.includes(meId) && m.includes(partnerId); })
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (completed[0]) { courseName = completed[0].courseName || completed[0].title || 'ゴルフ'; roundDate = completed[0].date || ''; roundId = completed[0].id; }
  } catch { /* best-effort */ }

  const [lo, hi] = meId < partnerId ? [meId, partnerId] : [partnerId, meId];
  const now = Date.now();
  await saveSession(pairId, {
    pairId, userA: lo, userB: hi, roundId,
    courseName, roundDate, matchKind: kind,
    // 自発開始扱い：cronの自動①通知と二重にならないよう notifyCount=1 / lastNotifyAt=now。
    notifyCount: 1, firstNotifyAt: now, lastNotifyAt: now,
    candidatesA: [], candidatesB: [],
    agreedDate: null, agreedAt: null, postedRoundId: null,
    optedOutBy: [], status: 'notified',
  });
  return NextResponse.json({ ok: true, pairId }, { headers: noStore });
}
