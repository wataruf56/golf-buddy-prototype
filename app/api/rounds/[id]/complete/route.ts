import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { addNotificationMany } from '@/lib/notifications';

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

  // 参加者全員へ「マッチングしよう」通知（ホームの🔔に出る）。詳細ページ下部の
  // 💘マッチングで「また回りたい / 異性として気になる」を相手に送れる。両思いの
  // ときだけ双方に通知される。
  try {
    await addNotificationMany(
      participants,
      'match',
      '🏌️ ラウンドお疲れさまでした！一緒に回った人に「また回りたい / 気になる」を送れます',
      `/round/${params.id}`,
    );
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true });
}
