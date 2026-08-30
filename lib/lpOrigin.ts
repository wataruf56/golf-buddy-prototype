// 「どのLPから来たか」を、アプリを開くときまで持ち越すための記憶。
//
// 【なぜ要るか】
// トップLPの「LINEで始める」は /app → LIFF のURLへ転送するので、
// `?lp=top` をURLで運べる。ところが **/links（インスタのリンクハブ）は
// LINEの友だち追加URLへ直接飛ばす**ため、パラメータを載せられない。
// LINEの友だち追加URLには何も付けられないという制約がある。
//
// その結果、リンクハブから来た人は「LINEアプリに移った」までしか記録が残らず、
// そこから先（アプリが開いた・会員になった）が追えなかった。
//
// /links と /liff は **どちらも app.goltomo.com＝同一オリジン**なので、
// localStorage で持ち越せる。ここに置いておけば、あとでリッチメニュー等から
// アプリを開いたときに /liff が読み取って、続きの段につなげられる。
//
// 【一度きりにする理由】
// 読み取ったら消す。消さないと、その人が以後アプリを開くたびに
// ずっと「リンクハブから来た人」として数えられ、ファネルが実態とずれる。
const KEY = 'gb_from_lp';
const AT = 'gb_from_lp_at';
const MAX_AGE = 30 * 86400 * 1000;   // 30日。これより古い記憶は当てにしない

/** LP側で呼ぶ。すでに記憶があれば上書きしない（最初に触れた入口を残す）。 */
export function rememberLpOrigin(page: string): void {
  if (!page) return;
  try {
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, String(page).replace(/[^a-z]/g, '').slice(0, 20));
    localStorage.setItem(AT, String(Date.now()));
  } catch { /* localStorage が使えない環境では諦める */ }
}

/** /liff 側で呼ぶ。読んだら消す（一度きり）。古すぎるものは無視する。 */
export function takeLpOrigin(): string {
  try {
    const v = localStorage.getItem(KEY) || '';
    const at = Number(localStorage.getItem(AT) || 0);
    localStorage.removeItem(KEY);
    localStorage.removeItem(AT);
    if (!v || !at || Date.now() - at > MAX_AGE) return '';
    return v;
  } catch { return ''; }
}
