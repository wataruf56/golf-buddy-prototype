import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (round.hostId !== meId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { round: updatedRound, pendingForUser } = await db.completeRound(params.id);
  // Create pending review records for ALL participants reviewing each other.
  const participants = [updatedRound.hostId, ...(updatedRound.applicantIds || [])];
  const allPending = participants.flatMap((reviewer) => pendingForUser(reviewer));

  // 既に「また回りたい / 異性として気になる」を表明済みの相手には、再びレビューを
  // 促さない（気持ちはレビュー時に1回伝われば十分）。まだどちらも押していない
  // 相手は、次のラウンドでもう一度レビュー画面を出す（回を重ねて気になる等も拾う）。
  const adb = getAdminDb() as any;
  async function alreadyExpressed(from: string, to: string): Promise<boolean> {
    if (!adb) return false;
    try {
      const [a, r] = await Promise.all([
        adb.collection('_matchLikes').doc(`again__${from}__${to}`).get(),
        adb.collection('_matchLikes').doc(`romantic__${from}__${to}`).get(),
      ]);
      return a.exists || r.exists;
    } catch { return false; }
  }
  const checks = await Promise.all(allPending.map((p) => alreadyExpressed(p.reviewerId, p.revieweeId)));
  const toCreate = allPending.filter((_, i) => !checks[i]);
  await db.createPendingReviews(toCreate);
  // マッチングはレビュー完了後の画面で行うため、ここでの全員通知はしない。
  return NextResponse.json({ ok: true });
}
