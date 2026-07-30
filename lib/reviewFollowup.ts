import 'server-only';
import { db } from '@/lib/db';
import { pushTo, pushToMany, liffUrl } from '@/lib/linePush';
import { webPushText, webPushToMany } from '@/lib/webPush';
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
        await pushToMany(targetIds, n.line, liffUrl(link), 'reviewReminder');
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

// 【1回限りの一斉通知】いま未対応(pending)のレビューがある全ユーザーへ、レビュー依頼を
// 今すぐ1回送る（管理画面のボタンから手動実行）。3日後リマインドの時間ゲートや冪等スタンプは
// 使わない純粋な単発オペレーション。同じユーザーに複数ラウンドの未対応があっても通知は1回だけ、
// 代表として直近の完了ラウンドのタイトル/リンクを使う。
export async function runReviewBlast(): Promise<{ ok: boolean; reviewers: number; sent: number }> {
  const pendings = await db.listAllPendingReviews();

  // reviewerId → 未対応の roundId 集合。
  const byReviewer = new Map<string, Set<string>>();
  for (const p of pendings) {
    if (!p.reviewerId || !p.roundId) continue;
    if (!byReviewer.has(p.reviewerId)) byReviewer.set(p.reviewerId, new Set());
    byReviewer.get(p.reviewerId)!.add(p.roundId);
  }

  const roundCache = new Map<string, any>();
  const getRound = async (rid: string) => {
    if (roundCache.has(rid)) return roundCache.get(rid);
    const r = await db.getRound(rid).catch(() => null);
    roundCache.set(rid, r);
    return r;
  };

  const { renderNotif } = await import('@/lib/notificationTemplateStore');
  const { addNotification } = await import('@/lib/notifications');

  let sent = 0;
  for (const [reviewerId, roundIds] of byReviewer) {
    // 代表ラウンド＝最も新しい完了ラウンド（通知文のタイトル/リンク用）。
    let best: any = null;
    for (const rid of roundIds) {
      const r = await getRound(rid);
      if (!r) continue;
      if (!best || (r.completedAt || 0) > (best.completedAt || 0)) best = r;
    }
    const roundName = best?.title || best?.courseName || 'ラウンド';
    const link = best ? `/round/${best.id}` : '/';
    const n = await renderNotif('reviewReminder', { '募集タイトル': roundName });

    if (n.inApp) addNotification(reviewerId, 'reviewReminder', n.inApp, link).catch(() => {});
    const u = await db.getUser(reviewerId);
    if (isNotifyEnabled(u as any, 'reviewReminder')) {
      try {
        await pushTo(reviewerId, n.line, liffUrl(link), 'reviewReminder');
        await webPushText(reviewerId, n.webTitle, n.webBody, link, `review-blast-${reviewerId}`).catch(() => {});
      } catch (e) {
        console.warn('[review-blast] push failed', reviewerId, (e as Error).message);
      }
    }
    sent++;
  }

  return { ok: true, reviewers: byReviewer.size, sent };
}
