import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, saveSession, membersOfPair, recordRematchEvent, notifyRematch } from '@/lib/rematch';

// POST /api/rematch/[pairId]/posted  body: { roundId }
// ⑥ 再会からラウンドが立ったことを記録し、相手を「誘う/承認」なしで参加確定にする。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const roundId = String(body?.roundId || '').slice(0, 60);

  // 相手を参加確定に（招待・承認をスキップ）。作成者（=host=自分）のラウンドのみ。
  const partnerId = s.userA === meId ? s.userB : s.userA;
  let joined = false;
  if (roundId) {
    try {
      const round = await db.getRound(roundId);
      if (round && round.hostId === meId && !(round.applicantIds || []).includes(partnerId)) {
        const applicantIds = [...(round.applicantIds || []), partnerId];
        await db.updateRound(roundId, { applicantIds, currentCount: (round.currentCount || 1) + 1 } as any);
        joined = true;
        notifyRematch(partnerId, `🏌️ 再会ラウンドに参加が確定しました。日程・集合場所を確認しましょう👇`, `/round/${roundId}`).catch(() => {});
      }
    } catch { /* 参加確定の失敗は記録処理を妨げない */ }
  }

  await saveSession(pairId, { postedRoundId: roundId || s.postedRoundId || null, status: 'posted' } as any);
  recordRematchEvent('rematch_to_round_post', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});
  return NextResponse.json({ ok: true, joined }, { headers: noStore });
}
