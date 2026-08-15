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
// CTAは StartButton（/app?ref=◯◯ → LIFF）。生のLINE友だち追加URLに変えると
// 流入経路タグ(?ref=)が運べなくなり、管理画面の「📥 流入経路」に出なくなるので注意。

import type { Metadata } from 'next';
import { RefCapture } from '@/components/RefCapture';
import { StartButton } from '@/components/StartButton';

const SITE = 'https://goltomo.com';
const DIAGNOSIS_URL = '/golmoti.html';

export const metadata: Metadata = {
  title: 'ゴルトモ｜ゴルフ友達を探す・作るなら。20〜30代のゴル友マッチング',
  description:
    '一緒に回るゴルフ友達が見つかる。誘える人がいなくても、一人で参加して気の合う「ゴル友」を作れます。ゴルフ初心者もOK、スコア帯は「ラウンド未経験」から選べます。車がなくても送迎（ピックアップ）の調整がアプリの中で完結。20〜30代限定・ラウンド後の相互レビューで安心。LINEで完結、アプリのダウンロード不要。',
  keywords: [
    'ゴルトモ', 'ゴルフ 友達', 'ゴルフ友達 作り方', 'ゴル友', 'ゴルフ 仲間',
    'ゴルフ マッチング', 'ゴルフ 一人参加', 'ゴルフ 初心者 ラウンド',
    'ラウンドデビュー', 'ゴルフ 初心者 募集', 'ゴルフ 未経験',
    'ゴルフ 車なし', 'ゴルフ 送迎', 'ゴルフ 相乗り',
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

/* 前提バッジ（DL不要・LINE完結・年代） */
.sv .badges{display:grid;gap:9px;padding:0 18px;margin-top:4px}
.sv .bd{display:flex;align-items:baseline;gap:10px;background:var(--cream);border:2.5px solid var(--ink);
  border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:11px 15px;font-size:12.5px;font-weight:700;color:#6b5a44}
.sv .bd b{font-size:13.5px;font-weight:900;color:var(--ink);white-space:nowrap}
/* 3大メリット（ヒーロー直下・大きく・一目で） */
.sv .big3{display:flex;flex-direction:column;gap:11px;padding:16px 18px 0}
.sv .big3 .b{display:flex;gap:13px;align-items:flex-start;background:var(--cream);border:2px solid #d8c3a0;border-radius:16px;padding:15px}
.sv .big3 .b .ic{font-size:30px;line-height:1;flex:none}
.sv .big3 .b .tt{font-size:16px;font-weight:900;line-height:1.35;margin:0}
.sv .big3 .b .ds{font-size:12.5px;font-weight:700;color:#6b5a44;margin-top:4px;line-height:1.65}
.sv .big3 .b .rev{display:inline-flex;align-items:center;gap:8px;margin-top:8px;background:var(--paper);border:2px solid var(--ink);border-radius:10px;padding:5px 9px}
.sv .big3 .b .rev .st{color:var(--mustard);font-size:14px;letter-spacing:1px;-webkit-text-stroke:.5px var(--ink)}
.sv .big3 .b .rev .lbl{font-size:11px;font-weight:900;color:var(--ink)}
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
.sv .nums{margin:22px 16px 0}
.sv .nums .nh{font-size:15px;font-weight:900;text-align:center;margin-bottom:10px}
.sv .nums .ng{display:grid;grid-template-columns:1fr 1fr;gap:9px}
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
.sv .bar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;z-index:70;padding:11px 16px calc(11px + env(safe-area-inset-bottom));background:rgba(244,232,206,.96);backdrop-filter:blur(5px);border-top:2.5px solid var(--ink)}
.sv .bar .b2{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:var(--orange);color:var(--cream);font-weight:900;font-size:16px;padding:15px;border:3px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink)}
.sv .wrap{padding-bottom:88px}
/* QRで共有（LPのURLを他の人に見せて読み取ってもらう） */
.sv .qrshare{margin:30px 18px 0;background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:20px 18px;text-align:center}
.sv .qrshare .qh{font-size:15px;font-weight:900;margin-bottom:3px}
.sv .qrshare .qs{font-size:12px;font-weight:700;color:#6b5a44;margin-bottom:14px}
.sv .qrshare .qbox{display:inline-block;background:var(--cream);border:2.5px solid var(--ink);border-radius:14px;padding:10px;box-shadow:3px 3px 0 var(--ink)}
.sv .qrshare .qbox img{display:block;width:190px;height:190px}
.sv .qrshare .qu{font-size:11px;font-weight:900;color:var(--teal);margin-top:12px}
`;

// LPに載せる数字は5分ごとに作り直す（実データを新鮮に保ちつつ読み取りを抑える）。
export const revalidate = 300;

// LPに出す実績値。手で書いた数字はすぐ古くなり事実と食い違うので、必ず実データから出す。
// 母数(n)も持ち、少なすぎるものは表示しない。
type LpStats = {
  fillRate: number | null; fillN: number;         // 募集の満員率
  againRate: number | null; againN: number;       // また回りたい率
  femaleRate: number | null; genderN: number;     // 女性比率
  avgAge: number | null; ageN: number;            // 平均年齢
};

// トップLPの「社会的証明」（募集中件数・直近1hログイン数）を実データから作る。
// 失敗しても LP 本体は必ず描画する（各表示は呼び出し側で少数時に非表示）。
async function getLpData(): Promise<{ openCount: number; activeNow: number; stats: LpStats }> {
  const now = Date.now();
  let openCount = 0;
  let activeNow = 0;
  const stats: LpStats = { fillRate: null, fillN: 0, againRate: null, againN: 0, femaleRate: null, genderN: 0, avgAge: null, ageN: 0 };
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
  } catch { /* DBが不調でもLPは出す */ }
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      const agg = await adb.collection('users').where('lastActiveAt', '>=', now - 3600000).count().get();
      activeNow = agg.data().count || 0;
    }
  } catch { /* noop */ }

  // 実績値（満員率・また回りたい率・男女比・平均年齢）
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      const [rSnap, uSnap, revSnap, likeSnap] = await Promise.all([
        adb.collection('rounds').limit(2000).get(),
        adb.collection('users').limit(2000).get(),
        adb.collection('reviews').limit(5000).get(),
        adb.collection('_matchLikes').limit(8000).get(),
      ]);

      // 満員率＝完了した募集の「メンバー数 / 定員」の平均（飲み会は除く）
      const membersOf = (r: any) => [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean);
      const done = rSnap.docs.map((d: any) => d.data() || {})
        .filter((r: any) => r.status === 'completed' && r.eventType !== 'drink');
      stats.fillN = done.length;
      if (done.length) {
        const sum = done.reduce((a: number, r: any) => a + Math.min(1, membersOf(r).length / Math.max(1, r.maxSpots || 1)), 0);
        stats.fillRate = Math.round((sum / done.length) * 100);
      }

      // また回りたい率＝「レビューをくれた人」のうち「また回りたい」を押した人の割合
      const reviewersOf: Record<string, Set<string>> = {};
      revSnap.docs.forEach((d: any) => {
        const x = d.data() || {};
        if (!x.revieweeId || !x.reviewerId) return;
        (reviewersOf[x.revieweeId] = reviewersOf[x.revieweeId] || new Set()).add(x.reviewerId);
      });
      const againOf: Record<string, Set<string>> = {};
      likeSnap.docs.forEach((d: any) => {
        const x = d.data() || {};
        if (x.kind !== 'again' || !x.from || !x.to) return;
        (againOf[x.to] = againOf[x.to] || new Set()).add(x.from);
      });
      let ag = 0, pairs = 0;
      Object.entries(reviewersOf).forEach(([to, revs]) => {
        (revs as Set<string>).forEach((from) => { pairs++; if (againOf[to]?.has(from)) ag++; });
      });
      stats.againN = pairs;
      if (pairs) stats.againRate = Math.round((ag / pairs) * 100);

      // 会員の属性（テスト・システムは除外）
      let male = 0, female = 0, ageSum = 0, ageN = 0;
      uSnap.docs.forEach((d: any) => {
        const u = d.data() || {};
        if (u.isSystem || u.isTestAccount) return;
        if (u.gender === 'male') male++; else if (u.gender === 'female') female++;
        const age = Number(u.age || 0);
        if (age >= 15 && age <= 90) { ageSum += age; ageN++; }
      });
      stats.genderN = male + female;
      if (stats.genderN) stats.femaleRate = Math.round((female / stats.genderN) * 100);
      stats.ageN = ageN;
      if (ageN) stats.avgAge = Math.round(ageSum / ageN);
    }
  } catch { /* 数字が取れなくてもLPは出す */ }

  return { openCount, activeNow, stats };
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ゴルトモ',
  alternateName: ['GOLTOMO', 'ゴルフMBTI診断'],
  url: `${SITE}/`,
  description:
    '一緒に回るゴルフ友達が見つかるLINEアプリ。20〜30代限定。ラウンド募集と相互レビューで、気の合う「ゴル友」とつながれる。',
  publisher: { '@type': 'Organization', name: '合同会社シクミヤ', url: `${SITE}/` },
};

export default async function LandingPage() {
  const { openCount, activeNow, stats } = await getLpData();
  // 数字は少ないと逆効果なので、十分あるときだけ出す（実データ・虚偽なし）。
  const showOpen = openCount >= 3;
  const showActive = activeNow >= 3;
  const showProof = showOpen || showActive;

  // 「数字で見るゴルトモ」。母数が足りない項目は黙って落とす。
  const numbers: Array<{ value: string; label: string; sub: string }> = [];
  if (stats.fillRate != null && stats.fillN >= 5) {
    numbers.push({ value: `${stats.fillRate}%`, label: '募集が満員に', sub: `完了した${stats.fillN}件の平均充足率` });
  }
  if (stats.againRate != null && stats.againN >= 20) {
    numbers.push({ value: `${stats.againRate}%`, label: 'また回りたい', sub: `一緒に回った後の評価${stats.againN}件` });
  }
  if (stats.avgAge != null && stats.ageN >= 20) {
    numbers.push({ value: `${stats.avgAge}歳`, label: '参加者の平均年齢', sub: '20〜30代限定コミュニティ' });
  }
  if (stats.femaleRate != null && stats.genderN >= 20) {
    numbers.push({ value: `${100 - stats.femaleRate}:${stats.femaleRate}`, label: '男女比', sub: `男性${100 - stats.femaleRate}% ／ 女性${stats.femaleRate}%` });
  }
  const statsAsOf = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '/');
  const APP = 'https://app.goltomo.com';
  return (
    <div className="sv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      {/* 流入経路キャプチャ（?ref=instagram 等を初回のみ記憶） */}
      <RefCapture />

      <div className="wrap">
        <div className="top">
          <div className="logo"><span className="m">⛳</span>ゴルトモ</div>
          <span className="free">無料</span>
        </div>

        {/* ヒーロー */}
        <header className="hero">
          <div className="sun" aria-hidden="true" />
          <span className="lb">⛳ ゴルフ友達さがし</span>
          <h1>一緒に回る<br /><span className="hl">ゴルフ友達</span>が<br />見つかる。</h1>
          <p>
            誘える人がいなくても大丈夫。<br />
            一人で参加して、気の合う人と「ゴル友」に。
          </p>
        </header>

        {/* 3大メリット（一目で伝える） */}
        <div className="big3">
          <div className="b">
            <div className="ic">🛡️</div>
            <div>
              <h2 className="tt">初めましてでも、安心。</h2>
              <div className="ds">ラウンド後の相互レビューで、その人が“変な人”じゃないかが★で見えます。マナーの良い人が可視化されるので、知らない人と回るのが不安でも大丈夫。</div>
              <div className="rev"><span className="st">★★★★☆</span><span className="lbl">また回りたい 12/14</span></div>
            </div>
          </div>
          <div className="b">
            <div className="ic">⛳</div>
            <div>
              <h2 className="tt">募集も参加も、気軽に。</h2>
              <div className="ds">コースが決まっていなくてもOK。一人参加でも1タップで申し込めます。「行きたいけど誘う人がいない」を無くします。</div>
            </div>
          </div>
          <div className="b">
            <div className="ic">🚗</div>
            <div>
              <h2 className="tt">車がなくても、行ける。</h2>
              <div className="ds">送迎（ピックアップ）の調整がアプリの中で完結。拾える駅を登録、参加者は申込時に希望を答えるだけ。LINEで何往復もしません。</div>
            </div>
          </div>
        </div>

        {/* 上部CTA（ファーストビューで登録に進めるように） */}
        <div className="cta2">
          <StartButton className="p">💬 LINEで無料ではじめる</StartButton>
          <a className="s" href={`${APP}/links/rounds`}>⛳ 募集中のラウンドを見る</a>
          <div className="mc">LINEログインのみ ・ 約30秒で完了 ・ アプリDL不要</div>
        </div>

        {/* 社会的証明（実データ・十分あるときだけ表示） */}
        {showProof && (
          <div className="proof">
            {showOpen && <span className="pchip t">⛳ いま募集中 <b>{openCount}</b>件</span>}
            {showActive && <span className="pchip o"><span className="live" /> 直近1時間 <b>{activeNow}</b>人</span>}
          </div>
        )}

        {/* 数字（すべて実データ。母数が少ない項目は出さない） */}
        {numbers.length > 0 && (
          <section className="nums">
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


        {/* 公式コンペの男女比配慮（女性が孤立しないよう組み分け） */}
        <div className="comp">
          <span className="pill">👩 女性も安心</span>
          <h2>ゴルトモ公式コンペは、<br />男女比とグループを配慮。</h2>
          <p>主催コンペは男女比のバランスをとります。例えば<b>20人なら 男性12 : 女性8</b>。</p>
          <div className="ratio">
            <div className="rp m"><span className="n">12</span>👨 男性</div>
            <div className="rp f"><span className="n">8</span>👩 女性</div>
          </div>
          <div className="rbar"><span className="rm" style={{ flex: 12 }} /><span className="rf" style={{ flex: 8 }} /></div>
          <div className="note">
            <span>🤝</span>
            <span><b>女性が1組に1人きりにならないよう組み分けを配慮。</b>同性の友達もできるので、はじめてでも安心して参加できます。</span>
          </div>
        </div>

        {/* CTA */}
        <div className="cta">
          <h2>ゴルフ友達を<br />見つけにいく</h2>
          <p>登録は無料。アプリのDLは不要。<br />まずはLINEログインだけ。</p>
          <StartButton className="btn">LINEで始める →</StartButton>
          <span className="sub">無料 ・ LINEログインのみ ・ アプリDL不要</span>
        </div>

        <div className="quiz">
          <div className="t">⛳ 自分がどんなゴルファーか知りたい人へ</div>
          <a href={DIAGNOSIS_URL}>ゴルフ版MBTI・16タイプ診断をしてみる →</a>
        </div>

        {/* QRで共有：この画面を見せて、他の人に読み取ってもらうと同じLPが開く */}
        <div className="qrshare">
          <div className="qh">📱 このページを共有</div>
          <div className="qs">読み取るとこのページが開きます。<br />お友達に見せてシェアしてください。</div>
          <div className="qbox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qr-lp.svg" alt="ゴルトモのQRコード（読み取るとLPが開きます）" width={190} height={190} />
          </div>
          <div className="qu">goltomo.com</div>
        </div>

        <footer>
          <div className="fl">⛳ ゴルトモ</div>
          <div style={{ fontSize: 11, color: '#8a7256', marginBottom: 6 }}>※ 20〜30代限定のサービスです</div>
          © 2026 Goltomo（合同会社シクミヤ）
        </footer>

        {/* 追従CTAバー（スクロール中も常に登録に進める） */}
        <div className="bar">
          <StartButton className="b2">💬 LINEで無料ではじめる</StartButton>
        </div>
      </div>
    </div>
  );
}
