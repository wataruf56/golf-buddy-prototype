// 管理画面（admin.goltomo.com）からアプリ側の画面へ飛ぶためのURLを作る。
//
// middleware は admin ホストで /admin と /api/admin 系しか通さないため、
// 管理画面から `/profile/xxx` のような相対リンクを置くと 404 になる。
// アプリのホストを付けた絶対URLにして解決する。
// （/profile と /round はログイン不要で閲覧できるので、そのまま開ける）
const APP_ORIGIN = 'https://app.goltomo.com';

function appOrigin(): string {
  if (typeof window === 'undefined') return APP_ORIGIN;
  const h = window.location.hostname;
  // ローカル開発や app ホスト上で見ているときは相対リンクのままにする。
  if (h === 'localhost' || h === '127.0.0.1' || !h.startsWith('admin.')) return '';
  return APP_ORIGIN;
}

/** ユーザーのプロフィール画面へのURL。 */
export const appProfileUrl = (userId: string) => `${appOrigin()}/profile/${encodeURIComponent(userId)}`;

/** ラウンド詳細へのURL。 */
export const appRoundUrl = (roundId: string) => `${appOrigin()}/round/${encodeURIComponent(roundId)}`;
