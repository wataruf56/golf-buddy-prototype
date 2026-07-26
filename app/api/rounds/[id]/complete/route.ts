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

  // 飲み会（eventType='drink'）は相互レビュー/再会エンジンを持たない。完了として
  // 記録するだけで、pendingレビューの生成もレビュー依頼通知も行わない。
  if (updatedRound.eventType === 'drink') {
    return NextResponse.json({ ok: true });
  }

  // 同組の全員ぶんの pending を作る。以前は「既に again/romantic 済みの相手」を
  // スキップしていたが、レビュー画面で「過去に押した状態」で再表示し、外せば解除
  // できるようにするため、スキップせず全員ぶん作る（クライアント側で現在のlike状態を
  // 事前反映する）。
  const participants = [updatedRound.hostId, ...(updatedRound.applicantIds || [])];
  const allPending = participants.flatMap((reviewer) => pendingForUser(reviewer));
  await db.createPendingReviews(allPending);

  // 完了と同時に、参加者へ「レビューをお願いします」＋レビュー画面URLを通知
  // （アプリ内インボックス＋LINE＋Web push）。ここで reviewReminderSentAt を打刻するので、
  // 時間ベースの round-reminders cron が同じラウンドを二重に通知することはない。
  // 未レビュー者への「3日後リマインド」は /api/cron/review-reminders が担当する。
  try {
    const participantIds = Array.from(new Set(participants)).filter(Boolean) as string[];
    const roundName = updatedRound.title || updatedRound.courseName || 'ラウンド';
    const link = `/round/${updatedRound.id}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('reviewReminder', { '募集タイトル': roundName });
    const { addNotificationMany } = await import('@/lib/notifications');
    if (n.inApp) addNotificationMany(participantIds, 'reviewReminder', n.inApp, link).catch(() => {});
    const users = await db.listUsers(participantIds);
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    const targetIds = users.filter((u) => isNotifyEnabled(u as any, 'reviewReminder')).map((u) => u.id);
    if (targetIds.length) {
      const { pushToMany, liffUrl } = await import('@/lib/linePush');
      await pushToMany(targetIds, n.line, liffUrl(link)).catch(() => {});
      const { webPushToMany } = await import('@/lib/webPush');
      await webPushToMany(targetIds, n.webTitle, n.webBody, link, `review-${updatedRound.id}`).catch(() => {});
    }
    await db.updateRound(updatedRound.id, { reviewReminderSentAt: Date.now() } as any);
  } catch (e) {
    console.warn('[complete] レビュー依頼通知に失敗', (e as Error).message);
  }

  // マッチングはレビュー完了後の画面で行うため、ここでの全員通知はしない。
  return NextResponse.json({ ok: true });
}
