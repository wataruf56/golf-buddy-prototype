import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { registeredParticipantIds, sameGroupPeerIds, isNoShow } from './groups';
import type { Round } from './types';

/**
 * 完了したラウンドの「一緒に回った人」が後から変わったとき、レビューをやり直す。
 *
 * 【いつ変わるか】
 *   ・完了後に組み分けを直した（前半・後半の入れ替えを含む）
 *   ・ゲスト枠だった人が翌日にゴルトモに登録し、主催者がその本人に置き換えた
 *
 * 【どこまでやり直すか】
 * 以前は「関わった人のレビューを全部消して作り直す」だったが、それだと
 * 変わっていない相手へのレビューまで消えて、もう一度書かされる。
 * ここでは**ペア単位**で見る：
 *   ・新しく同じ組になったペア → 双方に未提出（pending）を作る
 *   ・同じ組でなくなったペア   → そのペアの提出済み・未提出を消す
 *   ・変わらないペア           → 何もしない
 * 「また回りたい」のマッチ（_matchLikes）は本人の意思なので触らない。
 */

/** このラウンドで userId がレビューする相手。completeRound の定義と同じ。 */
export function reviewPeerIds(round: Round, userId: string): string[] {
  const registered = registeredParticipantIds(round);
  if (!registered.includes(userId) || isNoShow(round, userId)) return [];
  if (round.isCompetition) return sameGroupPeerIds(round, userId);
  return registered.filter((p) => p !== userId && !isNoShow(round, p));
}

const pairKey = (a: string, b: string) => `${a}__${b}`;

export async function reReviewAfterChange(
  roundId: string, before: Round, after: Round,
): Promise<{ added: number; removed: number; notify: string[] }> {
  const none = { added: 0, removed: 0, notify: [] as string[] };
  if (after.status !== 'completed') return none;
  const adb = getAdminDb() as any;
  if (!adb) return none;

  const everyone = Array.from(new Set([...registeredParticipantIds(before), ...registeredParticipantIds(after)]));
  const wasPair = new Set<string>();
  const nowPair = new Set<string>();
  for (const m of everyone) {
    for (const p of reviewPeerIds(before, m)) wasPair.add(pairKey(m, p));
    for (const p of reviewPeerIds(after, m)) nowPair.add(pairKey(m, p));
  }
  const removed = Array.from(wasPair).filter((k) => !nowPair.has(k));
  const added = Array.from(nowPair).filter((k) => !wasPair.has(k));
  if (!removed.length && !added.length) return none;

  // 同じ組でなくなったペア：提出済みも未提出も消す（もう相手ではないので）。
  if (removed.length) {
    const gone = new Set(removed);
    for (const coll of ['reviews', 'pendingReviews']) {
      try {
        const snap = await adb.collection(coll).where('roundId', '==', roundId).get();
        const dels: Promise<any>[] = [];
        snap.forEach((d: any) => {
          const x = d.data() || {};
          if (gone.has(pairKey(x.reviewerId, x.revieweeId))) dels.push(d.ref.delete());
        });
        await Promise.all(dels);
      } catch (e) { console.warn('[reReview] delete failed', coll, (e as Error).message); }
    }
  }

  // 新しく同じ組になったペア：双方に未提出を作る（idが決まっているので二重にならない）。
  const toCreate = added.map((k) => {
    const [reviewerId, revieweeId] = k.split('__');
    return { id: `p_${roundId}_${reviewerId}_${revieweeId}`, roundId, reviewerId, revieweeId, status: 'pending' as const, createdAt: Date.now() };
  });
  if (toCreate.length) await db.createPendingReviews(toCreate as any);

  // 新しくレビューする相手ができた人。呼び出し側が通知に使う。
  const notify = Array.from(new Set(toCreate.map((x) => x.reviewerId)));
  return { added: toCreate.length, removed: removed.length, notify };
}

/** 新しくレビュー相手ができた人へ「レビューをお願いします」。 */
export async function notifyNewReviewPairs(round: Round, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const { addNotification } = await import('./notifications');
    const { isNotifyEnabled } = await import('./notifyPrefs');
    const { pushTo, liffUrl } = await import('./linePush');
    const link = `/round/${round.id}`;
    const text = `📝 「${round.title}」で一緒に回った人が追加されました。レビューをお願いします`;
    const users = await db.listUsers(userIds);
    await Promise.all(userIds.map(async (uid) => {
      await addNotification(uid, 'reviewReminder', text, link).catch(() => {});
      const u = users.find((x) => x?.id === uid);
      if (isNotifyEnabled(u as any, 'reviewReminder')) pushTo(uid, text, liffUrl(link), 'reviewReminder').catch(() => {});
    }));
  } catch (e) { console.warn('[reReview] notify failed', (e as Error).message); }
}
