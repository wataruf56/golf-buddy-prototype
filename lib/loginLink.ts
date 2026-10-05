'use client';

// 「ログインする」の行き先を1か所にまとめる。
//
// 以前は `/liff?to=…` に飛ばしていた。LINEの外のブラウザ（iPhone の Safari など）でこれを踏むと、
// LINEログインを経て **Safari のまま** 戻ってきてしまう（2026-10-06 本人報告：シェアURLを Safari で
// 開いてログインしたら LIFF ではなく Safari のままだった）。
//
// LIFF の URL（https://liff.line.me/<LIFF_ID>?to=…）にすると、スマホでは LINE アプリの中（LIFF ブラウザ）で
// 開き直され、そこでは自動でログイン済みになる。`?to=` は /liff の入口が読んで元のページへ戻す
// （LINE のプッシュ通知の `liffUrl()` と同じ形。liff.state に畳まれても /liff 側で展開される）。
// PC で踏んだ場合は /liff が QR を出して止める（従来どおり）。
export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';

export function loginHref(to: string): string {
  return `https://liff.line.me/${LIFF_ID}?to=${encodeURIComponent(to || '/home')}`;
}

/** いまのページ（パス＋クエリ）に戻るログイン先。SSR 中は fallback を使う。 */
export function loginHrefHere(fallback: string): string {
  const here = typeof window !== 'undefined' ? window.location.pathname + window.location.search : fallback;
  return loginHref(here);
}

/** ボタンのハンドラから呼ぶ用。外部URLなので router.push ではなく素の遷移にする。 */
export function goLogin(to: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(loginHref(to));
}
