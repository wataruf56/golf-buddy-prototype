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

  // 文脈：2人が一緒だった直近の完了ラウンド（コース名・日付を通知/表示に使う）。
  // これが「今回のサイクル」の基準になる。
  let courseName = 'ゴルフ';
  let roundDate = '';
  let roundId = '';
  try {
    const completed = (await db.listRounds({ status: 'completed' }))
      .filter((r) => { const m = [r.hostId, ...(r.applicantIds || [])]; return m.includes(meId) && m.includes(partnerId); })
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    if (completed[0]) { courseName = completed[0].courseName || completed[0].title || 'ゴルフ'; roundDate = completed[0].date || ''; roundId = completed[0].id; }
  } catch { /* best-effort */ }

  const now = Date.now();
  const existing = await getSession(pairId);
  if (existing) {
    // 「候補日」から再開するときは、前サイクルの名残（決定済み・投稿済み・辞退や、
    // 直近の完了ラウンドが変わった＝新サイクル、過ぎた合意日）はリセットして必ず
    // カレンダーから始める。進行中（notified/inputting）で同じラウンド由来のときだけ
    // そのまま継続する（入力済みの候補日を保持）。
    const today = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST
    const newerRound = !!roundId && existing.roundId !== roundId;
    const agreedPast = !!existing.agreedDate && existing.agreedDate < today;
    const concluded = existing.status === 'agreed' || existing.status === 'posted' || existing.status === 'optedout';
    const stale = newerRound || agreedPast || concluded;
    if (!stale) return NextResponse.json({ ok: true, pairId }, { headers: noStore });
    // 新しいサイクル：文脈を更新し、候補日・合意・確定・辞退をクリアして最初から。
    await saveSession(pairId, {
      roundId: roundId || existing.roundId,
      courseName, roundDate, matchKind: kind,
      candidatesA: [], candidatesB: [],
      agreedDate: null, agreedAt: null, postedRoundId: null,
      optedOutBy: [],
      status: 'notified',
      notifyCount: (existing.notifyCount || 0) + 1,
      lastNotifyAt: now,
    });
    return NextResponse.json({ ok: true, pairId, reset: true }, { headers: noStore });
  }

  const [lo, hi] = meId < partnerId ? [meId, partnerId] : [partnerId, meId];
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
