import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { markDirectReviewDone, type DirectReview } from './friendLink';
import type { ReviewVerdict } from './types';

// ラウンドに紐づかないレビュー（直接レビュー）の保存。
// 使うのは2か所（2026-10-13〜 共通化）:
//   - /api/friends/review           … 「評価」タブ（友達になった相手。friendIds のチェックは呼ぶ側）
//   - /api/friends/requests/[id]    … 友達申請の受け手が「同じ組でした」を選んだその場で評価
//                                      （友達にならない場合もあるので friendIds は見ない）
// 書き込む先は通常のレビューとまったく同じ:
//   - reviews      … ★（また回りたい率）の分母と never を決める
//   - _matchLikes  … again / romantic のマッチ判定
// なので集計側（/api/users/ratings・track-record・LPの実績）に手を入れる必要はない。
export const DIRECT_VERDICTS: ReviewVerdict[] = ['again', 'romantic', 'never', 'either'];

const likeId = (kind: 'again' | 'romantic', from: string, to: string) => `${kind}__${from}__${to}`;

async function likeExists(adb: any, id: string): Promise<boolean> {
  if (!adb) return false;
  try { const s = await adb.collection('_matchLikes').doc(id).get(); return s.exists; }
  catch { return false; }
}
async function setLike(adb: any, id: string, data: any, on: boolean) {
  if (!adb) return;
  try {
    if (on) await adb.collection('_matchLikes').doc(id).set(data, { merge: true });
    else await adb.collection('_matchLikes').doc(id).delete();
  } catch { /* noop */ }
}

export const isDirectVerdict = (v: unknown): v is ReviewVerdict =>
  typeof v === 'string' && (DIRECT_VERDICTS as string[]).includes(v);

/** 2人が異性同士か（「異性として気になる」はこのときだけ選べる）。 */
export function isOppositeSex(a?: { gender?: string } | null, b?: { gender?: string } | null): boolean {
  const g1 = a?.gender, g2 = b?.gender;
  return (g1 === 'male' || g1 === 'female') && (g2 === 'male' || g2 === 'female') && g1 !== g2;
}

export type SaveDirectReviewResult =
  | { ok: true; matched: boolean }
  | { ok: false; status: number; error: string; message?: string };

/**
 * 直接レビューを1件保存する。検証（verdict・異性チェック・相手の存在）もここで行う。
 * friendIds の要否は呼ぶ側で判断する。
 *
 * notifyMatch=false のときは、マッチが成立しても通知を出さない
 * （友達申請の受け手が評価した場合。申請者には何も通知しない約束のため）。
 */
export async function saveDirectReview(input: {
  reviewerId: string;
  revieweeId: string;
  verdict: string;
  source: DirectReview['source'];
  notifyMatch: boolean;
  /** 取得済みならそのまま使う（二重読み込みを避ける） */
  reviewer?: any;
  reviewee?: any;
}): Promise<SaveDirectReviewResult> {
  const { reviewerId: meId, revieweeId, verdict, source, notifyMatch } = input;
  if (!revieweeId || revieweeId === meId || !isDirectVerdict(verdict)) {
    return { ok: false, status: 400, error: 'bad_request', message: '評価を選んでください' };
  }
  const [me, other] = await Promise.all([
    input.reviewer !== undefined ? input.reviewer : db.getUser(meId),
    input.reviewee !== undefined ? input.reviewee : db.getUser(revieweeId),
  ]);
  if (!other) return { ok: false, status: 404, error: 'not_found', message: '相手が見つかりません' };

  // 「異性として気になる」は異性同士のときだけ（ラウンド後レビューと同じ制約）。
  if (verdict === 'romantic' && !isOppositeSex(me, other)) {
    return { ok: false, status: 403, error: 'not_opposite_sex', message: '「異性として気になる」は異性の相手のみ選べます' };
  }

  // roundId は「どこで一緒だったか」の代わりに direct を入れる。
  // 集計側は roundId を見ていないので、これで問題ない。
  await db.createReview({
    roundId: 'direct',
    reviewerId: meId,
    revieweeId,
    stars: 0,
    tags: [],
    verdict,
    createdAt: Date.now(),
    isAnonymous: true,
  } as any);

  const adb = getAdminDb() as any;
  const wantRomantic = verdict === 'romantic';
  const wantAgain = verdict === 'romantic' || verdict === 'again';
  const againExisted = await likeExists(adb, likeId('again', meId, revieweeId));

  await setLike(adb, likeId('romantic', meId, revieweeId),
    { from: meId, to: revieweeId, kind: 'romantic', roundId: 'direct', ts: Date.now() }, wantRomantic);
  await setLike(adb, likeId('again', meId, revieweeId),
    { from: meId, to: revieweeId, kind: 'again', roundId: 'direct', ts: Date.now() }, wantAgain);

  // 「評価」タブに同じ相手を二度出さない。依頼が無くても done の記録を残す。
  await markDirectReviewDone(meId, revieweeId, source);

  // マッチ（相互いいね）が **新しく** 成立したか。
  let matched = false;
  if (wantAgain && !againExisted) {
    matched = await likeExists(adb, likeId('again', revieweeId, meId));
    if (matched && notifyMatch) {
      const { addNotification } = await import('./notifications');
      const { isNotifyEnabled } = await import('./notifyPrefs');
      const { pushTo, liffUrl } = await import('./linePush');
      const link = '/buddies?tab=again';
      const party = String.fromCodePoint(0x1f389);
      const notify = async (uid: string, user: any, partner: string) => {
        await addNotification(uid, 'match', `${party} ${partner}さんとマッチしました！「行きたい」同士です`, link);
        if (isNotifyEnabled(user, 'match')) {
          pushTo(uid, `${party} ${partner}さんとマッチしました！`, liffUrl(link), 'match').catch(() => {});
        }
      };
      await notify(revieweeId, other, me?.displayName || '相手');
      await notify(meId, me, other?.displayName || '相手');
    }
  }

  return { ok: true, matched };
}
