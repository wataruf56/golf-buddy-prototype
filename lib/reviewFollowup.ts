import 'server-only';
import { db } from '@/lib/db';
import { pushToMany, liffUrl } from '@/lib/linePush';
import { webPushToMany } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// 3日後のレビュー再リマインドの実処理。ラウンド完了時に一度「レビューをお願いします」を
// 送るが（app/api/rounds/[id]/complete）、3日経ってもレビューしていない人だけに、もう一度
// だけリマインドを送る。完了済み・未レビュー(pending が残っている)ユーザーのみが対象。
//
// 冪等性: 送った時点で round.reviewFollowupSentAt を打刻し、同じラウンドで二度と送らない。
//
// NOTE: Next.js のルートファイルは GET/POST 等の決められた export しか許されない
// （それ以外を export すると `next build` の型検証で失敗する）。そのためこの実処理は
// route ではなく lib に置き、route と housekeeping から import して使う。
const FOLLOWUP_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // 3日
export const REVIEW_FOLLOWUP_MAX_PER_TICK = 50;

export async function runReviewFollowup(
  limit = REVIEW_FOLLOWUP_MAX_PER_TICK,
): Promise<{ ok: boolean; scanned: number; sent: number; skipped: number }> {
  const now = Date.now();
  const rounds = (await db.listRounds({ status: 'completed' })).filter((r) => {
    if (r.reviewFollowupSentAt) return false;              // 既に3日後リマインド済み
    const base = r.completedAt || r.reviewReminderSentAt;  // 完了時刻を起点に3日
    if (!base) return false;
    return now >= base + FOLLOWUP_DELAY_MS;
  }).slice(0, limit);

  let sent = 0;
  let skipped = 0;
  for (const round of rounds) {
    // まだレビューしていない（pending が残っている）参加者だけに送る。
    const pendingReviewerIds = await db.listPendingReviewersForRound(round.id);
    if (!pendingReviewerIds.length) {
      // 全員レビュー済み → 何もせず打刻だけして再スキャンを止める。
      await db.updateRound(round.id, { reviewFollowupSentAt: now } as any);
      skipped++;
      continue;
    }

    const roundName = round.title || round.courseName || 'ラウンド';
    const link = `/round/${round.id}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('reviewReminder', { '募集タイトル': roundName });

    // アプリ内インボックスは常に（LINE設定に関係なく）記録。
    const { addNotificationMany } = await import('@/lib/notifications');
    if (n.inApp) addNotificationMany(pendingReviewerIds, 'reviewReminder', n.inApp, link).catch(() => {});

    const users = await db.listUsers(pendingReviewerIds);
    const targetIds = users.filter((u) => isNotifyEnabled(u as any, 'reviewReminder')).map((u) => u.id);
    if (targetIds.length) {
      try {
        await pushToMany(targetIds, n.line, liffUrl(link));
        await webPushToMany(targetIds, n.webTitle, n.webBody, link, `review-followup-${round.id}`).catch(() => {});
        sent++;
      } catch (e) {
        console.warn('[review-reminders] push failed', { roundId: round.id, err: (e as Error).message });
      }
    } else {
      skipped++;
    }

    // 送信の成否に関わらず打刻（LINE不通時に毎tick再送しないため）。
    await db.updateRound(round.id, { reviewFollowupSentAt: now } as any);
  }

  return { ok: true, scanned: rounds.length, sent, skipped };
}
