// サービス本体のLP（診断ではない方）。https://goltomo.com/service
//
// 配色・書体は診断LP public/golmoti.html に合わせている（レトロ・ポップ／太枠＋ハードシャドウ）。
// トップLP app/lp/page.tsx とは別物で、こちらは「ラウンド募集 → 相互レビュー →
// また回りたい／異性として気になる」というサービスの中身を見せることに振っている。
//
// 掲載しているのは実装済みの機能のみ（lib/meetOptions.ts, app/(main)/guide/page.tsx を参照）。
// 実画面のキャプチャ（public/guide-shots/*.png）は一度載せたが、縦長すぎて
// 横スワイプの並びが間延びするため取りやめた。載せ直すなら縦横比の扱いから設計し直すこと。
//
// 注意：LPホスト(goltomo.com)は middleware が既定で /lp に rewrite するので、
// /service を許可リストに入れてある。

import type { Metadata } from 'next';
import { MEET_OPTIONS } from '@/lib/meetOptions';

const SITE = 'https://goltomo.com';
const LINE_URL = 'https://line.me/R/ti/p/@711xiyrs';
const DIAGNOSIS_URL = '/golmoti.html';

export const metadata: Metadata = {
  title: 'ゴルトモ｜20〜30代のゴルフ仲間が見つかるLINEアプリ',
  description:
    'ラウンドを募集して、一緒に回って、また会いたい人とつながる。20〜30代限定のゴルフコミュニティ「ゴルトモ」。ラウンド後の相互レビューで「また一緒に回りたい」「異性として気になる」がお互い一致したときだけマッチ。LINEで完結、ダウンロード不要。',
  alternates: { canonical: `${SITE}/service` },
  // 下書き段階のため検索には出さない（公開OKになったら外して sitemap に追加する）。
  robots: { index: false, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'ゴルトモ',
    url: `${SITE}/service`,
    title: 'ゴルトモ｜20〜30代のゴルフ仲間が見つかるLINEアプリ',
    description:
      'ラウンドを募集して、一緒に回って、また会いたい人とつながる。20〜30代限定のゴルフコミュニティ。',
    locale: 'ja_JP',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
};

const CSS = `
/* globals.css は body を #a9c7bb（500px以下は #E7F2EC）にしている。このLPは
   紙色ベースなので、iOSのオーバースクロールで下からミントが覗かないよう上書きする。
   html を付けて詳細度を上げ、globals.css のメディアクエリにも勝たせる。 */
html body{background:#F4E8CE}
.sv{min-height:100vh;--paper:#F4E8CE;--orange:#E8643C;--teal:#2A8C82;--mustard:#E8A93C;--ink:#33271B;--cream:#FBF3E0;--pink:#D9557E;
  font-family:'Zen Maru Gothic',sans-serif;background:var(--paper);color:var(--ink);line-height:1.75;font-weight:500;
  overflow-x:hidden;position:relative}
.sv *{box-sizing:border-box}
.sv .wrap{max-width:480px;margin:0 auto;position:relative}
/* 診断LPと同じドットの地紋。
   golmoti.html は inset:0 と left:50% を併用しているが、inset の right:0 が残るため
   幅が「50%〜右端」に潰れて画面の一部しか覆えない。ここでは width:100% を明示して直す。 */
.sv::before{content:"";position:fixed;top:0;bottom:0;left:50%;width:100%;max-width:480px;
  transform:translateX(-50%);z-index:60;
  pointer-events:none;opacity:.45;mix-blend-mode:multiply;
  background-image:radial-gradient(circle,rgba(51,39,27,.16) 1px,transparent 1.4px);background-size:7px 7px}
.sv .baloo{font-family:'Baloo 2',cursive}

.sv .top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px}
.sv .logo{display:flex;align-items:center;gap:8px;font-weight:900;font-size:19px}
.sv .logo .m{width:34px;height:34px;background:var(--orange);color:var(--cream);border-radius:50%;
  display:grid;place-items:center;font-size:17px;border:2.5px solid var(--ink)}
.sv .free{background:var(--mustard);font-weight:900;font-size:12px;padding:7px 13px;border-radius:999px;border:2.5px solid var(--ink)}

.sv .hero{padding:14px 22px 34px;text-align:center;position:relative}
.sv .sun{position:absolute;top:-10px;right:-60px;width:190px;height:190px;border-radius:50%;
  background:repeating-conic-gradient(var(--mustard) 0 12deg,transparent 12deg 24deg);opacity:.36;z-index:0}
.sv .hero .lb{position:relative;z-index:1;display:inline-block;background:var(--teal);color:var(--cream);
  font-weight:900;font-size:12.5px;padding:7px 16px;border-radius:999px;border:2.5px solid var(--ink)}
.sv h1{position:relative;z-index:1;font-size:33px;font-weight:900;line-height:1.3;margin:16px 0 0;letter-spacing:-.01em}
.sv h1 .hl{background:linear-gradient(transparent 62%,var(--mustard) 62%)}
.sv .hero p{position:relative;z-index:1;font-size:14px;font-weight:700;margin:16px 0 0;color:#6b5a44}

.sv .chap{display:flex;align-items:center;gap:12px;padding:0 22px;margin:52px 0 14px}
.sv .chap .no{width:44px;height:44px;flex:none;background:var(--cream);border:2.5px solid var(--ink);border-radius:50%;
  display:grid;place-items:center;font-size:20px;box-shadow:3px 3px 0 var(--ink)}
.sv .chap .lb{font-size:11px;font-weight:900;color:var(--teal);letter-spacing:.14em}
.sv .chap .tt{font-size:20px;font-weight:900;line-height:1.3}
.sv .lead{padding:0 22px;font-size:13.5px;font-weight:700;color:#6b5a44;margin:0 0 18px}

.sv .card{background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);
  margin:0 18px 16px;padding:20px 18px}
.sv .card h3{font-size:16.5px;font-weight:900;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.sv .card p{font-size:13.5px;margin:0;font-weight:500}
.sv .card p + p{margin-top:10px}

/* 前提バッジ（DL不要・LINE完結・年代） */
.sv .badges{display:grid;gap:9px;padding:0 18px;margin-top:4px}
.sv .bd{display:flex;align-items:baseline;gap:10px;background:var(--cream);border:2.5px solid var(--ink);
  border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:11px 15px;font-size:12.5px;font-weight:700;color:#6b5a44}
.sv .bd b{font-size:13.5px;font-weight:900;color:var(--ink);white-space:nowrap}

/* 両想いの説明図 */
.sv .duo{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin:4px 0 14px}
.sv .duo .who{background:var(--paper);border:2.5px solid var(--ink);border-radius:14px;padding:12px 8px;text-align:center}
.sv .duo .who .e{font-size:26px;line-height:1}
.sv .duo .who .n{font-size:11.5px;font-weight:900;margin-top:4px}
.sv .duo .who .sel{display:inline-block;margin-top:7px;background:var(--pink);color:#fff;border:2px solid var(--ink);
  border-radius:999px;font-size:10.5px;font-weight:900;padding:3px 9px}
.sv .duo .mid{font-size:22px;font-weight:900;color:var(--orange)}
.sv .match{background:var(--teal);color:var(--cream);border:2.5px solid var(--ink);border-radius:14px;
  padding:12px;text-align:center;font-weight:900;font-size:14px;box-shadow:3px 3px 0 var(--ink)}
.sv .secret{display:flex;gap:9px;align-items:flex-start;background:var(--paper);border:2.5px dashed var(--ink);
  border-radius:14px;padding:12px 13px;margin-top:14px;font-size:12.5px;font-weight:700}

/* 会い方チップ */
.sv .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.sv .chip{background:var(--paper);border:2.5px solid var(--ink);border-radius:999px;padding:6px 13px;
  font-size:12.5px;font-weight:900;box-shadow:2px 2px 0 var(--ink)}

/* 実績 */
.sv .stat{display:flex;gap:12px;align-items:center;background:var(--paper);border:2.5px solid var(--ink);
  border-radius:14px;padding:14px;margin-top:12px}
.sv .stat .big{font-family:'Baloo 2',cursive;font-size:34px;font-weight:800;color:var(--teal);line-height:1}
.sv .stat .tx{font-size:12.5px;font-weight:800}

/* CTA */
.sv .cta{margin:44px 18px 0;background:var(--orange);border:3px solid var(--ink);border-radius:22px;
  box-shadow:6px 6px 0 var(--ink);padding:28px 20px;text-align:center;color:var(--cream)}
.sv .cta h2{font-size:22px;font-weight:900;margin:0 0 10px;line-height:1.35}
.sv .cta p{font-size:13px;font-weight:700;margin:0 0 18px;opacity:.95}
.sv .btn{display:inline-block;background:var(--cream);color:var(--ink);border:3px solid var(--ink);border-radius:999px;
  font-size:16px;font-weight:900;padding:15px 34px;box-shadow:4px 4px 0 var(--ink);text-decoration:none}
.sv .sub{display:block;font-size:11.5px;font-weight:800;margin-top:14px;opacity:.95}
.sv .quiz{margin:22px 18px 0;background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;
  box-shadow:5px 5px 0 var(--ink);padding:18px;text-align:center}
.sv .quiz .t{font-size:14.5px;font-weight:900}
.sv .quiz a{display:inline-block;margin-top:10px;font-size:13px;font-weight:900;color:var(--teal);text-decoration:underline}
.sv footer{text-align:center;padding:38px 20px 46px;font-size:11.5px;font-weight:700;color:#6b5a44}
.sv footer .fl{font-weight:900;color:var(--orange);margin-bottom:4px}
`;

export default function ServiceLP() {
  return (
    <div className="sv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="wrap">
        <div className="top">
          <div className="logo"><span className="m">⛳</span>ゴルトモ</div>
          <span className="free">20〜30代限定</span>
        </div>

        {/* ヒーロー */}
        <header className="hero">
          <div className="sun" aria-hidden="true" />
          <span className="lb">⛳ ゴルフ仲間マッチング</span>
          <h1>一緒に回って、<br /><span className="hl">また会いたい人</span>と<br />つながる。</h1>
          <p>
            ラウンドを募集する。気の合う人と回る。<br />
            「また回りたい」がお互い一致したら、そこからが本番。
          </p>
        </header>

        {/* 前提バッジ（アプリDL不要・LINE完結） */}
        <div className="badges">
          <span className="bd"><b>📥 DL不要</b>アプリ入れずに使える</span>
          <span className="bd"><b>💬 LINEで完結</b>ログインも通知もLINE</span>
          <span className="bd"><b>⛳ 20〜30代</b>年代が近い人だけ</span>
        </div>

        {/* ラウンド投稿 */}
        <div className="chap">
          <div className="no">📝</div>
          <div>
            <div className="lb">POST</div>
            <div className="tt">ラウンドを募集する</div>
          </div>
        </div>
        <p className="lead">「行きたいけど、メンバーが集まらない」を無くす。</p>
        <div className="card">
          <h3>⛳ コース予約済み</h3>
          <p>すでに押さえたコースの空き枠に、一緒に回る仲間を募集できます。日程・費用・男女枠を決めて投稿するだけ。</p>
        </div>
        <div className="card">
          <h3>🗺 コース未定（これから決める）</h3>
          <p>「この辺で、この日あたり」だけでも募集できます。エリアと日程の希望を出して、集まった人とコースを決める形。</p>
        </div>
        <div className="card">
          <h3>🏆 5人以上ならコンペ</h3>
          <p>5〜50人の募集はコンペ・イベント扱いになり、専用のデザインで表示されます。</p>
        </div>

        {/* 相互レビュー */}
        <div className="chap">
          <div className="no">⭐</div>
          <div>
            <div className="lb">REVIEW</div>
            <div className="tt">ラウンド後の相互レビュー</div>
          </div>
        </div>
        <p className="lead">回って終わりにしない。ここがゴルトモの中心です。</p>
        <div className="card">
          <h3>🤝 同じ組だった人を評価</h3>
          <p>ラウンドが終わると、一緒に回った人をレビューできます。マナーの良い人が可視化されるので、初対面でも安心して参加できます。</p>
        </div>

        {/* また回りたい */}
        <div className="chap">
          <div className="no">🏌️</div>
          <div>
            <div className="lb">MATCH</div>
            <div className="tt">「また一緒に回りたい」</div>
          </div>
        </div>
        <p className="lead">お互いが選んだときだけ、マッチが成立します。</p>
        <div className="card">
          <div className="duo">
            <div className="who">
              <div className="e">🙋</div>
              <div className="n">あなた</div>
              <span className="sel">また回りたい</span>
            </div>
            <div className="mid">＋</div>
            <div className="who">
              <div className="e">🙆</div>
              <div className="n">相手</div>
              <span className="sel">また回りたい</span>
            </div>
          </div>
          <div className="match">🎉 マッチ成立 → メッセージでつながる</div>
          <div className="secret">
            <span>🔒</span>
            <span><b>片思いの間は、あなたの選択が相手に知られることは一切ありません。</b>両想いになったときだけ、お互いに通知されます。</span>
          </div>
        </div>

        {/* 異性として気になる */}
        <div className="chap">
          <div className="no">💘</div>
          <div>
            <div className="lb">ROMANTIC</div>
            <div className="tt">「異性として気になる」</div>
          </div>
        </div>
        <p className="lead">ゴルフだけで終わらせたくない人にも、同じ両想い方式で。</p>
        <div className="card">
          <h3>💘 こちらも両想いのときだけ</h3>
          <p>「また回りたい」と同じく、<b>お互いが選んだときだけ</b>マッチします。選んだことが相手に伝わることはありません。</p>
          <p>「異性として気になる」を選ぶと、「また回りたい」も自動的に含まれます。</p>
        </div>
        <div className="card">
          <h3>☕ 会い方は、軽いものから選べる</h3>
          <p>マッチしたら「OKな会い方」をお互いに選び、<b>重なったものだけ</b>が“お互いOK”になります。いきなり二人で会うのが不安でも大丈夫。</p>
          <div className="chips">
            {MEET_OPTIONS.map((o) => (
              <span className="chip" key={o.key}>{o.emoji} {o.label}</span>
            ))}
          </div>
        </div>

        {/* 実績 */}
        <div className="chap">
          <div className="no">📊</div>
          <div>
            <div className="lb">PROFILE</div>
            <div className="tt">「また回りたい」率が実績になる</div>
          </div>
        </div>
        <div className="card">
          <p>プロフィールには、<b>これまで何人とラウンドして、そのうち何人が「また回りたい」と答えたか</b>が表示されます。いい人と回るほど、次に誘われやすくなる仕組みです。</p>
          <div className="stat">
            <div className="big">12<span style={{ fontSize: 18 }}>/14</span></div>
            <div className="tx">14人と回って、12人が<br />「また回りたい」と回答</div>
          </div>
          <p style={{ fontSize: 11.5, color: '#8a7256', marginTop: 10 }}>※ 表示イメージです</p>
        </div>

        {/* CTA */}
        <div className="cta">
          <h2>まずはLINEで<br />友だち追加から</h2>
          <p>登録は無料。アプリのダウンロードは要りません。</p>
          <a className="btn" href={LINE_URL}>LINEで始める →</a>
          <span className="sub">無料 ・ LINEログインのみ ・ 20〜30代限定</span>
        </div>

        <div className="quiz">
          <div className="t">⛳ どんなゴルファーか、先に知りたい人は</div>
          <a href={DIAGNOSIS_URL}>ゴルフ版MBTI・16タイプ診断をしてみる →</a>
        </div>

        <footer>
          <div className="fl">⛳ ゴルトモ</div>
          © 2026 Goltomo（合同会社シクミヤ）
        </footer>
      </div>
    </div>
  );
}
