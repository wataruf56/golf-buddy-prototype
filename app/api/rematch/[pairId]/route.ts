import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, membersOfPair, overlapDates, recordRematchEvent } from '@/lib/rematch';
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

  return NextResponse.json({
    pairId,
    status: s.status,
    candidateWindowDays: cfg.candidateWindowDays,
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
