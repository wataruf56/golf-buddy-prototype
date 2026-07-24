import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { competitionGroupsComplete } from '@/lib/groups';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (round.hostId !== meId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // コンペは組み分け必須。相互レビューは「同じ組」の人だけを対象にするため、全員が
  // いずれかの組に入っている（または「当日来れなかった人」に移されている）必要がある。
  if (round.isCompetition && !competitionGroupsComplete(round)) {
    return NextResponse.json({
      error: 'groups_incomplete',
      message: '組分けが未登録です。相互レビューに関わるため、全参加者を組に割り当てる（当日来れなかった人は「当日来れなかった人」に移す）まで完了できません。',
    }, { status: 400 });
  }

  const { round: updatedRound, pendingForUser } = await db.completeRound(params.id);
  // 同組の全員ぶんの pending を作る。以前は「既に again/romantic 済みの相手」を
  // スキップしていたが、レビュー画面で「過去に押した状態」で再表示し、外せば解除
  // できるようにするため、スキップせず全員ぶん作る（クライアント側で現在のlike状態を
  // 事前反映する）。
  const participants = [updatedRound.hostId, ...(updatedRound.applicantIds || [])];
  const allPending = participants.flatMap((reviewer) => pendingForUser(reviewer));
  await db.createPendingReviews(allPending);
  // マッチングはレビュー完了後の画面で行うため、ここでの全員通知はしない。
  return NextResponse.json({ ok: true });
}
