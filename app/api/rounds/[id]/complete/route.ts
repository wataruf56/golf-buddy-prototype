import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

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
  await db.createPendingReviews(allPending);
  // マッチングはレビュー完了後の画面で行うため、ここでの全員通知はしない。
  return NextResponse.json({ ok: true });
}
