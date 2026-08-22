// LP と記事で共有するナビのCSS。
// 'use client' のファイルから export するとサーバーコンポーネント側で値が取れず
// （クライアント参照に置き換わる）スタイルが当たらなかったので、ここに分離する。
export const SITE_NAV_CSS = `
.snbtn{position:relative;z-index:3;width:40px;height:40px;flex:none;display:grid;place-content:center;gap:5px;
  background:var(--cream);border:2.5px solid var(--ink);border-radius:12px;box-shadow:2px 2px 0 var(--ink);cursor:pointer}
.snbtn span{display:block;width:18px;height:2.5px;background:var(--ink);border-radius:2px}
.snbtn:active{transform:translate(2px,2px);box-shadow:0 0 0 var(--ink)}
.snov{position:fixed;inset:0;z-index:120;background:rgba(51,39,27,.55);backdrop-filter:blur(2px);
  display:flex;justify-content:center;align-items:flex-start}
/* 閉じている状態。DOMにはリンクを残したまま（内部リンクとして機能させる）非表示にする。 */
.snov.snhide{display:none}
.snpanel{width:100%;max-width:480px;background:var(--paper);border-bottom:3px solid var(--ink);
  padding:14px 16px 18px;max-height:88vh;overflow:auto}
.snhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.sntitle{font-weight:900;font-size:15px}
.snclose{background:none;border:0;font-size:19px;font-weight:900;color:var(--ink);cursor:pointer;padding:4px 8px}
.snpanel ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.snpanel a{display:block;text-decoration:none;background:var(--cream);border:2.5px solid var(--ink);
  border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:12px 14px;color:var(--ink)}
.snpanel a:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}
.snpanel a[aria-current="page"]{background:var(--mustard)}
.snpanel .l{display:block;font-weight:900;font-size:14.5px}
.snpanel .n{display:block;font-size:11.5px;font-weight:700;color:#8a7256;margin-top:2px}
`;
