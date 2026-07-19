import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, membersOfPair, overlapDates, recordRematchEvent, listSessionsForUser, rematchDayMs } from '@/lib/rematch';
import { getRematchConfig } from '@/lib/rematchConfig';

// GET /api/rematch/[pairId] — 1ペアの状態（自分視点：自分/相手の候補日・重なり・status）。
// 当事者のみ閲覧可。開いたら rematch_notify_open を計測（通知タップ率）。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  recordRematchEvent('rematch_notify_open', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});

  const isA = s.userA === meId;
  const otherId = isA ? s.userB : s.userA;
  const mine = (isA ? s.candidatesA : s.candidatesB) || [];
  const theirs = (isA ? s.candidatesB : s.candidatesA) || [];
  const [other, cfg] = await Promise.all([db.getUser(otherId), getRematchConfig()]);

  // 過去の入力の再利用：自分が他のペアで出した候補日（今後の範囲内）をまとめて返す。
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + (9 * 3600 + cfg.candidateWindowDays * 86400) * 1000).toISOString().slice(0, 10);
  const pastSet = new Set<string>();
  try {
    const allSessions = await listSessionsForUser(meId);
    for (const os of allSessions) {
      if (os.pairId === pairId) continue;
      const cand = os.userA === meId ? os.candidatesA : os.candidatesB;
      (cand || []).forEach((d) => { if (d >= today && d <= maxDate) pastSet.add(d); });
    }
  } catch { /* best-effort */ }
  const myPastCandidates = Array.from(pastSet).sort();

  // 次の再会通知が送られる予定時刻（ms）。通知が有効・未決定・未停止・上限未達で、
  // 前回通知から intervalDays 経過後に送られる。該当しなければ null（今後の通知なし）。
  let nextNotifyAt: number | null = null;
  if (
    cfg.enabled &&
    s.status !== 'agreed' && s.status !== 'posted' &&
    (s.optedOutBy || []).length === 0 &&
    (s.notifyCount || 0) < cfg.maxCycles &&
    s.lastNotifyAt
  ) {
    nextNotifyAt = s.lastNotifyAt + cfg.intervalDays * rematchDayMs;
  }

  return NextResponse.json({
    pairId,
    status: s.status,
    nextNotifyAt,
    candidateWindowDays: cfg.candidateWindowDays,
    myPastCandidates,
    courseName: s.courseName || '',
    roundDate: s.roundDate || '',
    matchKind: s.matchKind,
    myCandidates: mine,
    theirCandidates: theirs,
    overlap: overlapDates(mine, theirs),
    agreedDate: s.agreedDate || null,
    postedRoundId: s.postedRoundId || null,
    optedOut: (s.optedOutBy || []).includes(meId),
    other: other
      ? { id: otherId, displayName: other.displayName || 'メンバー', avatar: other.avatar || '⛳', avatarUrl: (other as any).avatarUrl || '', age: other.age || 0 }
      : { id: otherId, displayName: 'メンバー', avatar: '⛳' },
  }, { headers: noStore });
}
