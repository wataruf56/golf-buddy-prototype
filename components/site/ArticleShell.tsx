import { SiteNav } from './SiteNav';
import { SITE_NAV_CSS } from './navCss';
import { LP_TRACK_SCRIPT } from '@/lib/lpTrackScript';

// 記事ページの共通の器。LPと同じ配色・書体で、読み物として読める幅に整える。
// 記事はSEOの主戦場なので、見出し構造（h1→h2→h3）を素直に保つ。
export const ARTICLE_CSS = `
html body{background:#F4E8CE}
.ar{--paper:#F4E8CE;--orange:#E8643C;--teal:#2A8C82;--mustard:#E8A93C;--ink:#33271B;--cream:#FBF3E0;--pink:#D9557E;
  min-height:100vh;background:var(--paper);color:var(--ink);
  font-family:'Zen Maru Gothic',sans-serif;line-height:1.9;font-weight:500}
.ar *{box-sizing:border-box}
.ar .wrap{max-width:680px;margin:0 auto;padding:0 18px 60px}
.ar .top{display:flex;align-items:center;justify-content:space-between;padding:14px 0}
.ar .logo{display:flex;align-items:center;gap:8px;font-weight:900;font-size:18px;text-decoration:none;color:var(--ink)}
.ar .logo .m{width:32px;height:32px;background:var(--orange);color:var(--cream);border-radius:50%;
  display:grid;place-items:center;font-size:16px;border:2.5px solid var(--ink)}

.ar h1{font-size:27px;font-weight:900;line-height:1.45;margin:14px 0 10px}
.ar .lead{font-size:14.5px;font-weight:700;color:#6b5a44;margin:0 0 8px}
.ar .meta{font-size:11.5px;color:#8a7256;font-weight:700;margin-bottom:18px}
.ar h2{font-size:20px;font-weight:900;line-height:1.5;margin:38px 0 12px;padding-left:12px;
  border-left:6px solid var(--teal)}
.ar h3{font-size:16px;font-weight:900;margin:24px 0 8px}
.ar p{font-size:14.5px;margin:0 0 14px}
.ar strong{font-weight:900}
.ar a{color:var(--teal);font-weight:800}

/* 目次 */
.ar .toc{background:var(--cream);border:2.5px solid var(--ink);border-radius:16px;
  box-shadow:4px 4px 0 var(--ink);padding:16px 18px;margin:0 0 28px}
.ar .toc .t{font-weight:900;font-size:14px;margin-bottom:8px}
.ar .toc ol{margin:0;padding-left:22px;font-size:13.5px;font-weight:700;line-height:2;list-style:decimal outside}
.ar .toc li{list-style:decimal outside}
.ar .toc a{text-decoration:none}

/* 実データの箱。記事の核なので目立たせる */
.ar .data{background:var(--teal);color:var(--cream);border:2.5px solid var(--ink);border-radius:16px;
  box-shadow:5px 5px 0 var(--ink);padding:16px 18px;margin:18px 0 22px}
.ar .data .dt{font-weight:900;font-size:13.5px;margin-bottom:10px}
.ar .data .dg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ar .data .dc{background:rgba(251,243,224,.14);border:2px solid rgba(251,243,224,.5);border-radius:12px;padding:10px;text-align:center}
.ar .data .dv{font-size:24px;font-weight:900;line-height:1.15}
.ar .data .dl{font-size:11.5px;font-weight:800;margin-top:2px}
.ar .data .dn{font-size:10px;opacity:.85;margin-top:2px;line-height:1.4}
.ar .data .note{font-size:11px;opacity:.9;margin-top:10px;line-height:1.6}

/* 比較表 */
.ar .tbl{overflow-x:auto;margin:14px 0 20px;-webkit-overflow-scrolling:touch}
.ar table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px;background:var(--cream)}
.ar th,.ar td{border:2px solid var(--ink);padding:9px 10px;text-align:left;vertical-align:top}
.ar th{background:var(--ink);color:var(--cream);font-weight:900;font-size:12px}
.ar td b{font-weight:900}
.ar .ok{color:#1f7a4d;font-weight:900}
.ar .ng{color:#b3402c;font-weight:900}

/* 補足・注意 */
.ar .callout{background:var(--cream);border:2.5px dashed var(--ink);border-radius:14px;
  padding:13px 15px;margin:14px 0 20px;font-size:13.5px;font-weight:700}

/* CTA */
.ar .cta{background:var(--orange);color:var(--cream);border:3px solid var(--ink);border-radius:20px;
  box-shadow:6px 6px 0 var(--ink);padding:22px 18px;text-align:center;margin:34px 0 10px}
.ar .cta h2{border:0;padding:0;margin:0 0 8px;font-size:19px;color:var(--cream)}
.ar .cta p{font-size:13px;font-weight:700;margin-bottom:14px}
.ar .cta .btn{display:block;background:var(--cream);color:var(--ink);text-decoration:none;
  font-weight:900;font-size:15.5px;padding:15px;border:2.5px solid var(--ink);border-radius:14px}
.ar .cta .sub{display:block;font-size:11.5px;font-weight:800;margin-top:10px}

/* 関連記事 */
.ar .rel{margin-top:34px}
.ar .rel .t{font-weight:900;font-size:15px;margin-bottom:10px}
.ar .rel a{display:block;text-decoration:none;background:var(--cream);border:2.5px solid var(--ink);
  border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:12px 14px;margin-bottom:9px;color:var(--ink)}
.ar .rel .l{display:block;font-weight:900;font-size:14px}
.ar .rel .n{display:block;font-size:11.5px;font-weight:700;color:#8a7256;margin-top:2px}

.ar footer{margin-top:40px;padding-top:18px;border-top:2px solid #d8c3a0;
  text-align:center;font-size:11.5px;color:#8a7256;font-weight:700}
` + SITE_NAV_CSS;

// page は計測上の面の名前。'about'（ゴルトモとは）/ 'guide'（記事）。
// これが無いと、検索から記事に来た人がどこで離脱したかが一切見えない。
export function ArticleShell({ current, page = 'guide', children }: { current?: string; page?: 'about' | 'guide'; children: React.ReactNode }) {
  return (
    <div className="ar">
      <style dangerouslySetInnerHTML={{ __html: ARTICLE_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: `window.__lpPage=${JSON.stringify(page)};` + LP_TRACK_SCRIPT }} />
      <div className="wrap">
        <div className="top">
          <a className="logo" href="/"><span className="m">⛳</span>ゴルトモ</a>
          <SiteNav current={current} />
        </div>
        {children}
        <footer>
          ⛳ ゴルトモ ／ 20〜30代限定のゴルフ友達マッチング<br />
          © 2026 Goltomo（合同会社シクミヤ）
        </footer>
      </div>
    </div>
  );
}
