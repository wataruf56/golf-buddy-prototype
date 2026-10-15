// トップLP。https://goltomo.com/（middleware が LPホストの / をここへ rewrite する）
//
// 2026-08-01に全面差し替え。旧LP（緑グラデ／AIスイング解析推し）はやめ、
// 「ゴルフ友達を探す・作る」に振った内容にした。配色・書体は診断LP
// public/golmoti.html に合わせている（レトロ・ポップ／太枠＋ハードシャドウ）。
//
// 掲載しているのは実装済みの機能のみ（lib/meetOptions.ts, app/(main)/guide/page.tsx を参照）。
// 実画面のキャプチャ（public/guide-shots/*.png）は一度載せたが、縦長すぎて
// 横スワイプの並びが間延びするため取りやめた。載せ直すなら縦横比の扱いから設計し直すこと。
//
// 2026-10-15：AI生成の人物写真（bg-hero/bg-nums/bg-cta）をやめ、ブランドの白クマと
// 実際のアプリ画面（見本データの切り抜き public/lp/sc-*.webp）に置き換えた。
// 作り物の「会員っぽい人」を見せると、実際に会った人との差で信頼を落とすため。
// 人物写真を戻すなら、実際のコンペで本人の了承を取った写真だけにすること。
// 見出し・ボタンの絵文字も同じ理由（AIが作ったっぽさ）で外している。
//
// CTAは StartButton（/app?ref=◯◯ → LIFF）。生のLINE友だち追加URLに変えると
// 流入経路タグ(?ref=)が運べなくなり、管理画面の「📥 流入経路」に出なくなるので注意。

import type { Metadata } from 'next';
import { RefCapture } from '@/components/RefCapture';
import { StartButton } from '@/components/StartButton';
import { LP_TRACK_SCRIPT } from '@/lib/lpTrackScript';
import { computeLpStats, EMPTY_LP_STATS, type LpStats } from '@/lib/lpStats';
import { SiteNav } from '@/components/site/SiteNav';
import { SITE_NAV_CSS } from '@/components/site/navCss';

const SITE = 'https://goltomo.com';
const DIAGNOSIS_URL = '/golmoti.html';

export const metadata: Metadata = {
  title: 'ゴルトモ｜ゴルフ友達を探す・作るなら。20〜30代のゴルフ友達マッチング',
  description:
    '一緒に回るゴルフ友達が見つかる。誘える人がいなくても、一人で参加して気の合う「ゴル友」を作れます。ゴルフ初心者もOK、スコア帯は「ラウンド未経験」から選べます。車がなくても送迎（ピックアップ）の調整がアプリの中で完結。20〜30代限定・ラウンド後の相互レビューで安心。LINEで完結、アプリのダウンロード不要。',
  keywords: [
    'ゴルトモ', 'ゴルフ 友達', 'ゴルフ友達 作り方', 'ゴルフ友達 探し', 'ゴル友', 'ゴルフ 仲間',
    'ラウンド募集', 'ゴルフ ラウンド募集', 'ラウンド 募集 サイト', 'ゴルフ 募集',
    'ゴルフ マッチング', 'ゴルフ 一人参加', 'ゴルフ 初心者 ラウンド',
    'ラウンドデビュー', 'ゴルフ 初心者 募集', 'ゴルフ 未経験',
    'ゴルフ 車なし', 'ゴルフ 送迎', 'ゴルフ 相乗り',
    'ゴルフ 20代', 'ゴルフ 30代', 'ゴルフ 同世代',
  ],
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    type: 'website',
    siteName: 'ゴルトモ',
    url: `${SITE}/`,
    title: 'ゴルトモ｜一緒に回るゴルフ友達が見つかる',
    description:
      '誘える人がいなくても大丈夫。一人で参加して、気の合う「ゴル友」を作れます。初心者もOK、車がなくても送迎の調整はアプリの中で。20〜30代限定。',
    locale: 'ja_JP',
    images: [{ url: `${SITE}/ogp-golmoti.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ゴルトモ｜一緒に回るゴルフ友達が見つかる',
    description: '誘える人がいなくても大丈夫。一人で参加して、気の合う「ゴル友」を作れます。',
    images: [`${SITE}/ogp-golmoti.png`],
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

.sv .top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;
  position:relative;z-index:2}   /* ヒーローの背景写真が上へはみ出すので前面に出す */
.sv .logo{display:flex;align-items:center;gap:8px;font-weight:900;font-size:19px}
.sv .logo .m{width:34px;height:34px;background:var(--orange);color:var(--cream);border-radius:50%;
  display:grid;place-items:center;font-size:17px;border:2.5px solid var(--ink)}
.sv .free{background:var(--mustard);font-weight:900;font-size:12px;padding:7px 13px;border-radius:999px;border:2.5px solid var(--ink)}

.sv .hero{padding:58px 0 30px;text-align:center;position:relative}
.sv .hcard{position:relative;z-index:1;margin:0 15px;padding:26px 17px 19px;
  background:var(--cream);border:3px solid var(--ink);border-radius:22px;box-shadow:5px 5px 0 var(--ink)}
/* カードの上辺に前足をかけて覗く白クマ（ブランドのキャラ） */
.sv .peek{position:absolute;left:50%;top:-74px;width:118px;height:auto;transform:translateX(-50%);z-index:2;pointer-events:none}
.sv .hero .lb{position:relative;z-index:1;display:inline-block;margin-top:8px;background:var(--teal);color:var(--cream);
  font-weight:900;font-size:12.5px;padding:7px 16px;border-radius:999px;border:2.5px solid var(--ink)}
.sv h1{position:relative;z-index:1;font-size:33px;font-weight:900;line-height:1.3;margin:14px 0 0;letter-spacing:-.01em}
.sv h1 .hl{background:linear-gradient(transparent 62%,var(--mustard) 62%)}
.sv .hero p{position:relative;z-index:1;font-size:13.5px;font-weight:700;margin:13px 0 0;color:#5c4c38}

/* 前提バッジ（DL不要・LINE完結・年代） */
.sv .badges{display:grid;gap:9px;padding:0 18px;margin-top:4px}
.sv .bd{display:flex;align-items:baseline;gap:10px;background:var(--cream);border:2.5px solid var(--ink);
  border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:11px 15px;font-size:12.5px;font-weight:700;color:#6b5a44}
.sv .bd b{font-size:13.5px;font-weight:900;color:var(--ink);white-space:nowrap}
/* 3大メリット（ヒーロー直下・大きく・一目で） */
.sv .big3{display:flex;flex-direction:column;gap:11px;padding:16px 18px 0}
.sv .big3 .b{background:var(--cream);border:2.5px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink);padding:15px}
.sv .big3 .b .no{font-family:'Baloo 2',cursive;font-size:13px;font-weight:800;color:var(--orange);letter-spacing:.06em;line-height:1.2}
.sv .big3 .b .tt{font-size:16px;font-weight:900;line-height:1.35;margin:0}
.sv .big3 .b .ds{font-size:12.5px;font-weight:700;color:#6b5a44;margin-top:4px;line-height:1.65}
.sv .big3 .b .rev{display:inline-flex;align-items:center;gap:8px;margin-top:8px;background:var(--paper);border:2px solid var(--ink);border-radius:10px;padding:5px 9px}
.sv .big3 .b .rev .lbl{font-size:11px;font-weight:900;color:var(--ink)}
/* 実際のアプリ画面（見本データ）の切り抜き */
.sv .shot{margin-top:12px;border:2.5px solid var(--ink);border-radius:14px;overflow:hidden;background:#fff;box-shadow:3px 3px 0 var(--ink)}
.sv .shot img{display:block;width:100%;height:auto}
.sv .shot .cap{font-size:10.5px;font-weight:800;color:#8a7256;background:var(--paper);border-top:2px solid var(--ink);padding:5px 10px;text-align:left}
.sv .hcard .shot{margin-top:16px}
/* セクション見出し（行ける日の使い方・比較・ほかにも・FAQ） */
.sv .sh{font-size:21px;font-weight:900;line-height:1.4;text-align:center;margin:44px 20px 16px}
/* 行ける日の使い方（3ステップ） */
.sv .steps .step{position:relative;background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);
  margin:0 18px 22px;padding:18px 16px 16px}
.sv .steps .sn{position:absolute;top:-14px;left:14px;width:34px;height:34px;border-radius:50%;background:var(--orange);color:var(--cream);
  border:2.5px solid var(--ink);display:grid;place-items:center;font-family:'Baloo 2',cursive;font-size:18px;font-weight:800;line-height:1}
.sv .steps h3{font-size:17px;font-weight:900;line-height:1.4;margin:6px 0 6px}
.sv .steps p{font-size:13px;font-weight:700;color:#6b5a44;margin:0;line-height:1.7}
.sv .steps .later{margin:0 18px;background:var(--paper);border:2.5px dashed var(--ink);border-radius:14px;padding:12px 14px;
  font-size:13px;font-weight:900;text-align:center}
/* ふつうのやり方との比較 */
.sv .cmp .cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 18px}
.sv .cmp .col{border:2.5px solid var(--ink);border-radius:16px;padding:14px 12px}
.sv .cmp .col.old{background:#ECE3D0;color:#7a6a55}
.sv .cmp .col.new{background:var(--teal);color:var(--cream);box-shadow:4px 4px 0 var(--ink)}
.sv .cmp .ch{font-size:14px;font-weight:900;margin-bottom:8px}
.sv .cmp ol{margin:0;padding-left:1.2em;font-size:12.5px;font-weight:800;line-height:1.6}
.sv .cmp li + li{margin-top:6px}
.sv .cmp .col.old li{text-decoration:line-through;text-decoration-color:rgba(122,106,85,.55)}
/* よくある質問 */
.sv .faq details{background:var(--cream);border:2.5px solid var(--ink);border-radius:14px;margin:0 18px 10px;padding:0 14px}
.sv .faq summary{cursor:pointer;list-style:none;font-size:14px;font-weight:900;padding:13px 22px 13px 0;position:relative;line-height:1.5}
.sv .faq summary::-webkit-details-marker{display:none}
.sv .faq summary::after{content:"+";position:absolute;right:0;top:10px;font-size:20px;font-weight:900;color:var(--orange)}
.sv .faq details[open] summary::after{content:"−"}
.sv .faq details p{font-size:13px;font-weight:700;color:#5c4c38;margin:0 0 14px;line-height:1.75}
/* 公式コンペ 男女比の配慮（女性も安心） */
.sv .comp{background:var(--cream);border:2px solid #d8c3a0;border-radius:20px;margin:16px 18px 0;padding:20px 18px}
.sv .comp .pill{display:inline-block;background:var(--pink);color:#fff;border:2.5px solid var(--ink);border-radius:999px;font-weight:900;font-size:12px;padding:5px 13px;box-shadow:2px 2px 0 var(--ink)}
.sv .comp h2{font-size:18px;font-weight:900;margin:12px 0 6px;line-height:1.4}
.sv .comp p{font-size:13px;font-weight:700;color:#4a3a2c;line-height:1.7}
.sv .comp .ratio{display:flex;gap:8px;margin:14px 0 8px}
.sv .comp .rp{flex:1;text-align:center;font-weight:900;font-size:15px;border:2.5px solid var(--ink);border-radius:12px;padding:11px 6px;box-shadow:3px 3px 0 var(--ink)}
.sv .comp .rp.m{background:var(--teal);color:var(--cream)}
.sv .comp .rp.f{background:var(--pink);color:#fff}
.sv .comp .rp .n{font-family:'Baloo 2';font-size:24px;display:block;line-height:1}
.sv .comp .rbar{display:flex;height:16px;border:2.5px solid var(--ink);border-radius:999px;overflow:hidden;margin-bottom:12px}
.sv .comp .rbar .rm{background:var(--teal)}
.sv .comp .rbar .rf{background:var(--pink)}
.sv .comp .note{display:flex;gap:9px;align-items:flex-start;background:var(--paper);border:2.5px dashed var(--ink);border-radius:14px;padding:12px 13px;font-size:12.5px;font-weight:700;margin-top:6px}

/* 数字・最終CTA：以前はAI生成の写真を敷いていたが、ほぼオーバーレイで埋もれて
   見えていなかったうえ「作り物っぽさ」の元だったので単色にし、クマを添える。 */
.sv .bgnums{position:relative;background:#24453A}
.sv .nums .nbear{position:absolute;right:10px;top:8px;width:64px;height:auto;pointer-events:none}
.sv .cta .bcw{width:150px;height:150px;margin:-4px auto 12px;border-radius:50%;background:#FCF6E0;
  border:3px solid var(--ink);box-shadow:4px 4px 0 var(--ink);display:grid;place-items:center;overflow:hidden}
.sv .cta .bcw img{display:block;width:128px;height:auto;margin-top:8px}

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
.sv .quiz{margin:22px 18px 0;background:var(--cream);border:2px solid #d8c3a0;border-radius:18px;
  padding:18px;text-align:center}
.sv .quiz .t{font-size:14.5px;font-weight:900}
.sv .quiz a{display:inline-block;margin-top:10px;font-size:13px;font-weight:900;color:var(--teal);text-decoration:underline}
.sv footer{text-align:center;padding:38px 20px 46px;font-size:11.5px;font-weight:700;color:#6b5a44}
.sv footer .fl{font-weight:900;color:var(--orange);margin-bottom:4px}
/* 上部CTA（ヒーロー直下・診断LPと同じ太枠＋ハードシャドウ） */
.sv .cta2{padding:2px 20px 0}
.sv .cta2 a{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font-weight:900}
.sv .cta2 .p{background:var(--orange);color:var(--cream);font-size:17px;padding:16px;border:3px solid var(--ink);border-radius:16px;box-shadow:5px 5px 0 var(--ink);margin-top:14px}
.sv .cta2 .p:active{transform:translate(2px,2px);box-shadow:3px 3px 0 var(--ink)}
.sv .cta2 .s{background:var(--cream);color:var(--ink);font-size:15px;padding:13px;border:2.5px solid var(--ink);border-radius:16px;box-shadow:3px 3px 0 var(--ink);margin-top:11px;cursor:pointer}
.sv .cta2 .s:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}
.sv a{cursor:pointer}
.sv .cta2 .mc{text-align:center;font-size:11.5px;font-weight:800;color:#8a7256;margin-top:11px}
/* 社会的証明 */
.sv .proof{display:flex;gap:9px;justify-content:center;padding:18px 18px 2px}
.sv .pchip{background:var(--cream);border:2px solid #d8c3a0;border-radius:14px;padding:9px 13px;font-weight:900;font-size:12px;display:flex;align-items:center;gap:6px}
.sv .pchip b{font-family:'Baloo 2';font-size:18px}
.sv .pchip.t b{color:var(--teal)}.sv .pchip.o b{color:var(--orange)}
.sv .live{width:8px;height:8px;border-radius:50%;background:var(--orange);display:inline-block;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
/* 今募集中カード */
.sv .rc{background:var(--cream);border:2.5px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink);margin:0 18px 11px;padding:13px;display:flex;gap:11px;align-items:flex-start;text-decoration:none;color:inherit;cursor:pointer}
.sv .rc:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}
.sv .rc .chev{font-size:20px;font-weight:900;color:var(--orange);flex:none;align-self:center;margin-left:2px}
.sv .rc .e{font-size:23px;margin-top:1px}
.sv .rc .ttl{font-size:13.5px;font-weight:900}
.sv .rc .meta{font-size:11.5px;font-weight:700;color:#6b5440;margin-top:3px}
.sv .rc .tag{font-size:10.5px;font-weight:900;padding:3px 9px;border-radius:999px;border:2px solid var(--ink);white-space:nowrap;align-self:center;flex:none}
.sv .rc .tag.g{background:var(--teal);color:var(--cream)}.sv .rc .tag.o{background:var(--mustard)}
/* 追従バー（fixedで中央480px幅・.sv::before と同じ方式。コンテンツは wrap の下余白で逃がす） */
/* 数字で見るゴルトモ（実データ） */
.sv .nums{margin:22px 0 0;padding:22px 16px 20px}
.sv .nums.bgnums .nh{color:var(--cream)}
.sv .nums.bgnums .nf{color:rgba(251,243,224,.75)}
.sv .nums .nh{font-size:15px;font-weight:900;text-align:center;margin-bottom:10px}
.sv .nums .ng{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.sv .nums .nc:last-child:nth-child(odd){grid-column:1 / -1}
.sv .nums .nc{background:var(--cream);border:2.5px solid var(--ink);border-radius:16px;
  padding:12px 8px;text-align:center;box-shadow:4px 4px 0 var(--ink)}
.sv .nums .nv{font-size:26px;font-weight:900;color:var(--teal);line-height:1.1;letter-spacing:-.02em}
.sv .nums .nl{font-size:12px;font-weight:900;margin-top:3px}
.sv .nums .ns{font-size:10px;font-weight:700;color:#8a7256;margin-top:3px;line-height:1.4}
.sv .nums .nf{font-size:10px;font-weight:700;color:#8a7256;text-align:center;margin-top:8px}
/* 日本語の折り返し。行末に1〜2文字だけ残る「ぶら下がり」を防ぐ。
   auto-phrase は文節単位で折るので、対応ブラウザでは大きく改善する。 */
.sv p,.sv .ds,.sv .qs,.sv .mc,.sv .ns,.sv .nl,.sv h1,.sv h2,.sv .tt{
  text-wrap:pretty;overflow-wrap:anywhere;line-break:strict}
.sv h1,.sv h2,.sv .tt,.sv .nh{text-wrap:balance;word-break:auto-phrase}
.sv p,.sv .ds,.sv .qs{word-break:auto-phrase}
/* A/Bテスト：<html data-lpv="a|b"> で出し分ける。
   計測スクリプトが描画前に属性を付けるので、切り替えのチラつきは起きない。
   属性が付く前（JS無効など）は A（現行）を見せる。 */
/* .sv .cta2 a{display:flex} の方が詳細度が高く打ち消されるため !important で確実に隠す */
.sv .v-b{display:none !important}
html[data-lpv="b"] .sv .v-a{display:none !important}
html[data-lpv="b"] .sv a.v-b{display:flex !important}
html[data-lpv="b"] .sv div.v-b,html[data-lpv="b"] .sv p.v-b{display:block !important}
.sv .bar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;z-index:70;padding:11px 16px calc(11px + env(safe-area-inset-bottom));background:rgba(244,232,206,.96);backdrop-filter:blur(5px);border-top:2.5px solid var(--ink)}
.sv .bar .b2{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:var(--orange);color:var(--cream);font-weight:900;font-size:16px;padding:15px;border:3px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink)}
.sv .wrap{padding-bottom:88px}
/* QRで共有（LPのURLを他の人に見せて読み取ってもらう） */
/* QR共有はスマホでは意味がない（自分の画面のQRは自分で読めない）。
   マウスがある環境＝PCでだけ出す。スマホでは丸ごと隠して縦を節約する。 */
.sv .qrshare{display:none}
@media (hover:hover) and (pointer:fine){.sv .qrshare{display:block}}
.sv .qrshare{margin:30px 18px 0;background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:20px 18px;text-align:center}
.sv .qrshare .qh{font-size:15px;font-weight:900;margin-bottom:3px}
.sv .qrshare .qs{font-size:12px;font-weight:700;color:#6b5a44;margin-bottom:14px}
.sv .qrshare .qbox{display:inline-block;background:var(--cream);border:2.5px solid var(--ink);border-radius:14px;padding:10px;box-shadow:3px 3px 0 var(--ink)}
.sv .qrshare .qbox img{display:block;width:190px;height:190px}
.sv .qrshare .qu{font-size:11px;font-weight:900;color:var(--teal);margin-top:12px}
`;

// トップLPの「社会的証明」（募集中件数・直近1hログイン数）を実データから作る。
// 失敗しても LP 本体は必ず描画する（各表示は呼び出し側で少数時に非表示）。
async function getLpData(): Promise<{ openCount: number; activeNow: number; price: { min: number; max: number } | null; stats: LpStats }> {
  const now = Date.now();
  let openCount = 0;
  let activeNow = 0;
  // いま募集中のゴルフの費用（1人あたり）の幅。FAQ「お金はかかりますか？」に使う。
  // 「1万円前後」など数字だけでない書き方は除く。3件以上そろったときだけ出す。
  let price: { min: number; max: number } | null = null;
  const stats: LpStats = { ...EMPTY_LP_STATS };
  try {
    const { db } = await import('@/lib/db');
    const [open, official] = await Promise.all([
      db.listRounds({ status: 'open' }),
      db.listOfficialRounds().catch(() => []),
    ]);
    const seen = new Set<string>();
    const rounds = [...open, ...official].filter((r) => {
      if (!r || seen.has(r.id)) return false;
      seen.add(r.id);
      return r.status === 'open' && !String(r.hostId || '').startsWith('test_');
    });
    openCount = rounds.length;
    const yen = rounds
      .filter((r) => r.eventType !== 'drink')
      .map((r) => String(r.price || '').replace(/[,，円\s]/g, ''))
      .filter((v) => /^\d{4,6}$/.test(v))
      .map(Number)
      .filter((n) => n >= 3000 && n <= 60000);
    if (yen.length >= 3) price = { min: Math.min(...yen), max: Math.max(...yen) };
  } catch { /* DBが不調でもLPは出す */ }
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      const agg = await adb.collection('users').where('lastActiveAt', '>=', now - 3600000).count().get();
      activeNow = agg.data().count || 0;
    }
  } catch { /* noop */ }

  // 実績値（満員率・また回りたい率・男女比・平均年齢）。
  // 失敗しても LP は出す（数字のセクションだけが消える）。
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      Object.assign(stats, await computeLpStats(adb));
    }
  } catch (e) {
    console.error('[lp] stats failed', e);
  }

  return { openCount, activeNow, price, stats };
}

// 実際の画面（見本データ）の切り抜き。キャプションで「見本」と明示する
function Shot({ src, w, h, alt, cap, eager }: { src: string; w: number; h: number; alt: string; cap: string; eager?: boolean }) {
  return (
    <div className="shot">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={w} height={h} loading={eager ? 'eager' : 'lazy'} />
      <div className="cap">{cap}</div>
    </div>
  );
}

const yenMan = (n: number) => (n % 10000 === 0 ? `${n / 10000}万円` : `${n.toLocaleString('ja-JP')}円`);

// よくある質問。/about の FAQ と答えをそろえる（片方だけ直さない）
function lpFaq(price: { min: number; max: number } | null): Array<{ q: string; a: string }> {
  const fee = price
    ? `（いま募集中のラウンドは1人${yenMan(price.min)}〜${yenMan(price.max)}くらい）`
    : '（金額は募集ごとに書いてあります）';
  return [
    { q: '行ける日を押したら、必ず行かないといけませんか？', a: 'いいえ。行けなくなったら、その日を外すだけです。その日のチャットからも抜けます。' },
    { q: '押した日は、誰に見えますか？', a: '同じ20〜30代の会員にだけ、名前・年齢・車の有無が出ます。' },
    { q: 'お金はかかりますか？', a: `アプリは無料です。かかるのはゴルフ場のプレー代だけです${fee}。募集に申し込んだ時点では払いません。` },
    { q: 'ひとりで参加していいですか？', a: 'はい。ほとんどの人がひとりで参加しています。' },
    { q: '初心者・ラウンド未経験でも参加できますか？', a: 'スコアの目安は「ラウンド未経験」から選べます。「初心者歓迎」「初心者のみ」の募集もあります。' },
    { q: '女性ひとりでも参加できますか？', a: '行ける日でも募集でも、申し込む前に男女の内訳が見えます。公式コンペでは、女性が1組に1人きりにならないように組みます。' },
    { q: '知らない人と回るのが不安です。', a: '一緒に回った人の評価（また回りたい率）がプロフィールに出ます。マナー違反は運営に通報できます。' },
    { q: '募集をキャンセルしたらどうなりますか？', a: '締切までならアプリから取り消せます。締切後のキャンセル料は募集ごとに主催者が決めて、募集ページに書いてあります。' },
    { q: '車を持っていなくても行けますか？', a: 'はい。行ける日では車を出せる人と乗れる人数が見えます。募集では、申し込むときに「乗せてほしい」と答えられます。' },
    { q: 'どこで回っていますか？', a: 'いまは千葉・埼玉の募集が中心です。' },
    { q: '年齢の制限はありますか？', a: '20〜30代限定です。アプリのダウンロードは要らず、LINEの中で使えます。' },
  ];
}

const INSTAGRAM_URL = 'https://www.instagram.com/goltomo.golf/';

// 構造化データ。WebSite と Organization を分けて出す。
// sameAs に公式SNSを並べると、検索エンジンが「ゴルトモ＝このインスタ」と
// 結び付けられる（ブランド検索でインスタが出やすくなる）。
const JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ゴルトモ',
    alternateName: ['GOLTOMO', 'ゴルトモ ゴルフ友達マッチング', 'ゴルフMBTI診断'],
    url: `${SITE}/`,
    inLanguage: 'ja',
    description:
      '一緒に回るゴルフ友達が見つかるLINEアプリ。20〜30代限定。ラウンド募集と相互レビューで、気の合う「ゴル友」とつながれる。',
    publisher: { '@type': 'Organization', name: '合同会社シクミヤ', url: `${SITE}/` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ゴルトモ',
    alternateName: 'GOLTOMO',
    url: `${SITE}/`,
    logo: `${SITE}/icons/icon-512.png`,
    description: '20〜30代限定のゴルフ友達マッチング。ラウンド募集に一人でも参加できる。',
    sameAs: [INSTAGRAM_URL],
    parentOrganization: { '@type': 'Organization', name: '合同会社シクミヤ' },
  },
  // 「ラウンド募集」「ゴルフ友達探し」で何ができるサービスかを明示する。
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'ゴルトモ',
    url: `${SITE}/`,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web (LINE)',
    description:
      'ゴルフのラウンド募集に一人で参加できるLINEアプリ。ゴルフ友達を探す・作る、ラウンド募集を立てる、送迎の調整まで完結。',
    featureList: [
      'ラウンド募集を探す・参加する',
      'ラウンド募集を立てて仲間を集める',
      'ゴルフ友達（ゴル友）を作る',
      '送迎（ピックアップ）の調整',
      'ラウンド後の相互レビュー',
    ],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
    sameAs: [INSTAGRAM_URL],
  },
];

export default async function LandingPage() {
  const { openCount, activeNow, price, stats } = await getLpData();
  // 数字は少ないと逆効果なので、十分あるときだけ出す（実データ・虚偽なし）。
  const showOpen = openCount >= 3;
  const showActive = activeNow >= 3;
  const showProof = showOpen || showActive;

  // 「数字で見るゴルトモ」。母数が足りない項目は黙って落とす。
  // まだ規模が小さいので、件数や人数より「質」（また回りたい率・満員率）を先に見せる。
  const numbers: Array<{ value: string; label: string; sub: string }> = [];
  if (stats.againRate != null && stats.againN >= 20) {
    numbers.push({ value: `${stats.againRate}%`, label: 'また回りたい', sub: `一緒に回った後の評価${stats.againN}件より` });
  }
  if (stats.fillRate != null && stats.fillN >= 3) {
    numbers.push({ value: `${stats.fillRate}%`, label: '募集が満員に', sub: `完了した${stats.fillN}件の平均充足率` });
  }
  if (stats.avgAge != null && stats.ageN >= 20) {
    numbers.push({ value: `${stats.avgAge}歳`, label: '参加者の平均年齢', sub: '20〜30代限定コミュニティ' });
  }
  if (stats.femaleRate != null && stats.genderN >= 20) {
    numbers.push({ value: `${100 - stats.femaleRate}:${stats.femaleRate}`, label: '男女比', sub: `男性${100 - stats.femaleRate}% ／ 女性${stats.femaleRate}%` });
  }
  // 公式コンペの実績。回数・人数が少ないうちは出さない
  const showCompe = stats.compeN >= 2 && stats.compePlayers >= 10;
  const faq = lpFaq(price);
  const statsAsOf = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');
  const APP = 'https://app.goltomo.com';
  return (
    <div className="sv">
      <style dangerouslySetInnerHTML={{ __html: CSS + SITE_NAV_CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      {/* LP計測（到達→スクロール→クリック→LINE遷移）。ユニークは visitorId 基準。 */}
      <script dangerouslySetInnerHTML={{ __html: `window.__lpPage="top";` + LP_TRACK_SCRIPT }} />
      {/* 流入経路キャプチャ（?ref=instagram 等を初回のみ記憶） */}
      <RefCapture />

      <div className="wrap">
        <div className="top">
          <div className="logo"><span className="m">⛳</span>ゴルトモ</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="free">無料</span>
            <SiteNav current="/" />
          </div>
        </div>

        {/* ヒーロー。2026-10-15〜 いちばん推す「行ける日」を主役に。画面は見本データ */}
        <header className="hero">
          <div className="hcard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="peek" src="/lp/bear-hook.webp" alt="" width={420} height={346} />
            <span className="lb">20〜30代限定・ゴルフ友達さがし</span>
            <h1>行ける日を押すだけ。<br /><span className="hl">ゴルフ友達</span>が<br />見つかる。</h1>
            <p>
              日程もコースも決めなくてOK。<br />
              同じ日に行ける人が3人そろうと、チャットが始まります。
            </p>
            <Shot src="/lp/av-day.webp" w={656} h={376} alt="ある日に行ける人の一覧" cap="「行ける日」の画面（見本データ）" eager />
          </div>
        </header>

        {/* 上部CTA（ファーストビューで登録に進めるように） */}
        <div className="cta2">
          {/* A：現行（LINE登録が主役） */}
          <StartButton className="p v-a" lp="cta_top">行ける日を入れてみる（無料）</StartButton>
          <a className="s v-a" href={`${APP}/links/rounds`} data-lp="rounds_top">まず募集を見てみる（登録不要）</a>
          {/* B：まず中身を見せる（登録不要の募集一覧が主役）。小さい累計件数は逆効果なので出さない */}
          <a className="p v-b" href={`${APP}/links/rounds`} data-lp="rounds_top_b">募集を見てみる</a>
          <div className="mc v-b">登録なしで見られます</div>
          <StartButton className="s v-b" lp="cta_top_b">LINEで参加する（無料）</StartButton>
          <div className="mc v-a">押すとLINEのログイン画面が開きます ・ 約30秒 ・ アプリDL不要</div>
        </div>

        {/* 社会的証明（実データ・十分あるときだけ表示） */}
        {showProof && (
          <div className="proof">
            {showOpen && <span className="pchip t">いま募集中 <b>{openCount}</b>件</span>}
            {showActive && <span className="pchip o"><span className="live" /> 直近1時間 <b>{activeNow}</b>人</span>}
          </div>
        )}

        {/* 行ける日の使い方（3ステップ）。実際の画面（見本データ）で見せる */}
        <section className="steps">
          <h2 className="sh">使い方は、<span className="hl">3ステップ</span></h2>
          <div className="step">
            <div className="sn">1</div>
            <h3>カレンダーで、行ける日を押す</h3>
            <p>何日でもOK。車を出せる人は、乗れる人数も選べます。押した日は、同じ20〜30代の会員に名前・年齢・車の有無が出ます。</p>
            <Shot src="/lp/av-cal.webp" w={656} h={590} alt="行ける日のカレンダー" cap="点の色＝その日に行ける人（青＝男性・ピンク＝女性）" />
          </div>
          <div className="step">
            <div className="sn">2</div>
            <h3>同じ日に3人そろうと、チャットが始まる</h3>
            <p>運営がメンバーを紹介してくれます。4人目からも合流できます。</p>
            <Shot src="/lp/av-room-top.webp" w={552} h={590} alt="同じ日に行ける人のグループチャット" cap="その日に行ける人のグループチャット（見本データ）" />
          </div>
          <div className="step">
            <div className="sn">3</div>
            <h3>コースと集合場所を決めて、回る</h3>
            <p>どのあたりで回るか、車を出せるかをチャットで相談。コースが決まらなくても、運営が一緒に探します。</p>
            <Shot src="/lp/av-room-talk.webp" w={552} h={323} alt="チャットでのやり取り" cap="チャットでのやり取り（見本データ）" />
          </div>
          <div className="later">行けなくなったら、その日を外すだけ。チャットからも抜けます。</div>
        </section>

        {/* ふつうのやり方との違い（行ける日のメリット） */}
        <section className="cmp">
          <h2 className="sh">誘う人さがしも、日程合わせも、<br />幹事もいらない。</h2>
          <div className="cols">
            <div className="col old">
              <div className="ch">ふつうは</div>
              <ol>
                <li>誘える人を探す</li>
                <li>LINEで日程を合わせる</li>
                <li>誰かが幹事になって予約</li>
              </ol>
            </div>
            <div className="col new">
              <div className="ch">行ける日なら</div>
              <ol>
                <li>空いている日を押しておく</li>
                <li>同じ日の人が自然に集まる</li>
                <li>コース探しは運営も手伝う</li>
              </ol>
            </div>
          </div>
        </section>

        {/* 行ける日のほかにできること。絵文字アイコンの代わりに実際の画面（見本データ）を見せる */}
        <h2 className="sh" style={{ marginTop: 40 }}>ほかにも、こんなこと</h2>
        <div className="big3">
          <div className="b">
            <div className="no">01</div>
            <h3 className="tt">回ったあと、お互いに「また回りたいか」を付けます</h3>
            <div className="ds">付けた内容は相手に知られません。お互いに「行きたい」を選んだときだけ、2人にマッチが届きます。</div>
            {stats.againRate != null && stats.againN >= 20 && (
              <div className="rev">
                <span className="lbl">また回りたい {stats.againRate}%（実際の評価{stats.againN}件）</span>
              </div>
            )}
            <Shot src="/lp/sc-review.webp" w={520} h={270} alt="ラウンド後のレビュー画面" cap="ラウンド後のレビュー画面（見本データ）" />
          </div>
          <div className="b">
            <div className="no">02</div>
            <h3 className="tt">募集から参加することもできます</h3>
            <div className="ds">日時・コース・費用・男女の内訳が、申し込む前にわかります。申し込みは主催者の承認制で、あとから取り消せます。申し込んだ時点ではお金はかかりません。</div>
            <Shot src="/lp/sc-round.webp" w={520} h={390} alt="募集の詳細画面" cap="募集の詳細画面（見本データ）" />
          </div>
          <div className="b">
            <div className="no">03</div>
            <h3 className="tt">車がなくても、駅で拾ってもらえる</h3>
            <div className="ds">主催者が拾える駅を登録しておき、参加するときに「乗せてほしい」と答えるだけ。待ち合わせの相談はアプリの中で済みます。</div>
            <Shot src="/lp/sc-join.webp" w={520} h={230} alt="募集への参加ボタン" cap="参加ボタンまわり（見本データ）" />
          </div>
        </div>

        {/* 数字（すべて実データ。母数が少ない項目は出さない） */}
        {numbers.length > 0 && (
          <section className="nums bgnums">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="nbear" src="/lp/bear-hook.webp" alt="" width={420} height={346} loading="lazy" />
            <h2 className="nh">数字で見るゴルトモ</h2>
            <div className="ng">
              {numbers.map((n) => (
                <div className="nc" key={n.label}>
                  <div className="nv">{n.value}</div>
                  <div className="nl">{n.label}</div>
                  <div className="ns">{n.sub}</div>
                </div>
              ))}
            </div>
            <div className="nf">アプリ内の実績データより（{statsAsOf}時点）</div>
          </section>
        )}

        {/* 公式コンペ。男女比のグラフは女性にとって不安材料になるので出さない（2026-10-15） */}
        <div className="comp">
          <span className="pill">公式コンペ</span>
          <h2>公式コンペは、女性が1組に<br />1人きりにならないように組みます。</h2>
          <p>運営が主催するコンペです。ひとりで申し込んでも、組み分けは運営が考えます。</p>
          {showCompe && (
            <div className="note">
              <span>これまで<b>{stats.compeN}回・{stats.compePlayers}人</b>が参加。そのうち<b>{stats.compeRepeat}人</b>は2回以上来ています。</span>
            </div>
          )}
        </div>

        {/* よくある質問（/about の FAQ と答えをそろえる） */}
        <section className="faq">
          <h2 className="sh">よくある質問</h2>
          {faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        {/* CTA */}
        <div className="cta">
          <div className="bcw">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lp/bear-chick.webp" alt="" width={360} height={353} loading="lazy" />
          </div>
          <h2 className="v-a">まずは、行ける日を<br />押してみる</h2>
          <h2 className="v-b">ゴルフ友達を<br />見つけにいく</h2>
          <p className="v-a">登録はLINEで30秒。<br />アプリのダウンロードは要りません。</p>
          <p className="v-b">まずは、いま出ている募集を見てみてください。<br />気になるものがあれば、そのまま申し込めます。</p>
          <StartButton className="btn v-a" lp="cta_final">まずは登録してみる →</StartButton>
          <a className="btn v-b" href={`${APP}/links/rounds`} data-lp="rounds_final_b">募集を見てみる →</a>
          {/* B はボタンが「募集を見てみる」なので、LINEログインの案内を出すと食い違う */}
          <div className="sub v-a">押すとLINEのログイン画面へ ・ 無料 ・ 退会はいつでも</div>
          <div className="sub v-b">登録なしで見られます ・ 参加するときだけLINEで登録（無料）</div>
        </div>

        <div className="quiz">
          <div className="t">自分がどんなゴルファーか知りたい人へ</div>
          <a href={DIAGNOSIS_URL} data-lp="mbti_link">ゴルフ版MBTI・16タイプ診断をしてみる →</a>
        </div>

        {/* QRで共有：この画面を見せて、他の人に読み取ってもらうと同じLPが開く */}
        <div className="qrshare">
          <div className="qh">このページを共有</div>
          <div className="qs">読み取るとこのページが開きます。<br />お友達に見せてシェアしてください。</div>
          <div className="qbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr-lp.svg" alt="ゴルトモのQRコード（読み取るとLPが開きます）" width={190} height={190} />
          </div>
          <div className="qu">goltomo.com</div>
        </div>

        <footer>
          <div className="fl">ゴルトモ</div>
          <div style={{ fontSize: 11, color: '#8a7256', marginBottom: 6 }}>※ 20〜30代限定のサービスです</div>
          <div style={{ marginBottom: 8 }}>
            <a href={INSTAGRAM_URL} target="_blank" rel="me noopener" data-lp="instagram_footer"
               style={{ fontSize: 12, fontWeight: 800, color: '#8a7256', textDecoration: 'underline' }}>
              公式Instagram（@goltomo.golf）
            </a>
          </div>
          © 2026 Goltomo（合同会社シクミヤ）
        </footer>

        {/* 追従CTAバー（スクロール中も常に登録に進める） */}
        <div className="bar"><StartButton className="b2" lp="cta_bar">無料ではじめる</StartButton></div>
      </div>
    </div>
  );
}
