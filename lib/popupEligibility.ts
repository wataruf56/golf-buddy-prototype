// 募集・案内などの「営業系」の自動ポップアップ／LINE を出してよい人か（2026-10-12）。
//
// 【なぜ】プロフィール未登録の新規さんが「さがす」を開いた瞬間に『募集のイチオシ』が出ていた。
// 登録もしていないのに開いたらすぐ売り込みが来る、という体験は離脱につながる。
// そこで営業系のポップアップは「プロフィールを登録して24時間たった人」にだけ出す。
//
// ルール（ここ1か所で決める。営業系はすべてこの関数を通す）：
//   1. プロフィール登録済み（年齢が入っている＝募集参加・LP の registered と同じ基準）
//   2. 登録から24時間以上たっている
//      登録時刻は users.profileCompletedAt（PATCH /api/me で年齢が初めて入ったときに記録）。
//      記録が無い古い会員は createdAt で代用（作成→登録の順なので、これより早くはならない）。
//      どちらも無い古い会員は、とうに登録済みとみなして出してよい。
//
// まだ条件を満たさない人には「出さない」だけで、見た印（promoSeen 等）は付けない。
// 期間中に24時間を過ぎれば、次にアプリを開いたときに出る。
//
// 対象：promo（募集のイチオシ）／official（運営枠の声かけ）／availMonthly（毎月の行ける日・LINE も）／
//       availPrompt（ラウンド後の行ける日）／hostNudge（次は募集してみない？）。
// 対象外：completion・groups・review・paymentAck・friendGate・chase・roomIntro・availIntro・swingIntro
//        （操作の続き・必須の確認・使い方の説明なので、登録直後でも出す）。
//
// サーバー・画面のどちらからでも使えるよう、ここは純粋な関数だけにする（server-only を付けない）。

export const MARKETING_POPUP_DELAY_MS = 24 * 60 * 60 * 1000;

type UserLike = { age?: number | null; profileCompletedAt?: number | null; createdAt?: number | null } | null | undefined;

/** プロフィール登録済みか（年齢が入っていれば登録済み。募集参加のゲートと同じ基準） */
export function isProfileRegistered(u: UserLike): boolean {
  return typeof u?.age === 'number' && u.age > 0;
}

/** プロフィールを登録した時刻（ms）。未登録なら null、時刻が分からない古い会員は 0 */
export function profileRegisteredAt(u: UserLike): number | null {
  if (!isProfileRegistered(u)) return null;
  const at = Number(u?.profileCompletedAt || 0);
  if (at > 0) return at;
  const created = Number(u?.createdAt || 0);
  return created > 0 ? created : 0;
}

/** 営業系の自動ポップアップ／LINE を出してよいか（登録済み かつ 登録から24時間以上） */
export function isMarketingPopupEligible(u: UserLike, now: number = Date.now()): boolean {
  const at = profileRegisteredAt(u);
  if (at === null) return false;
  return now - at >= MARKETING_POPUP_DELAY_MS;
}
