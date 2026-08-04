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
import { MEET_OPTIONS } from '@/lib/meetOptions';
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
.sv .quiz{margin:22px 18px 0;background:var(--cream);border:2.5px solid var(--ink);border-radius:18px;
  box-shadow:5px 5px 0 var(--ink);padding:18px;text-align:center}
.sv .quiz .t{font-size:14.5px;font-weight:900}
.sv .quiz a{display:inline-block;margin-top:10px;font-size:13px;font-weight:900;color:var(--teal);text-decoration:underline}
.sv footer{text-align:center;padding:38px 20px 46px;font-size:11.5px;font-weight:700;color:#6b5a44}
.sv footer .fl{font-weight:900;color:var(--orange);margin-bottom:4px}
/* 上部CTA（ヒーロー直下・診断LPと同じ太枠＋ハードシャドウ） */
.sv .cta2{padding:2px 20px 0}
.sv .cta2 a{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font-weight:900}
.sv .cta2 .p{background:var(--orange);color:var(--cream);font-size:17px;padding:16px;border:3px solid var(--ink);border-radius:16px;box-shadow:5px 5px 0 var(--ink);margin-top:14px}
.sv .cta2 .p:active{transform:translate(2px,2px);box-shadow:3px 3px 0 var(--ink)}
.sv .cta2 .s{background:var(--cream);color:var(--ink);font-size:15px;padding:13px;border:2.5px solid var(--ink);border-radius:16px;box-shadow:3px 3px 0 var(--ink);margin-top:11px}
.sv .cta2 .mc{text-align:center;font-size:11.5px;font-weight:800;color:#8a7256;margin-top:11px}
/* 社会的証明 */
.sv .proof{display:flex;gap:9px;justify-content:center;padding:18px 18px 2px}
.sv .pchip{background:var(--cream);border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:9px 13px;font-weight:900;font-size:12px;display:flex;align-items:center;gap:6px}
.sv .pchip b{font-family:'Baloo 2';font-size:18px}
.sv .pchip.t b{color:var(--teal)}.sv .pchip.o b{color:var(--orange)}
.sv .live{width:8px;height:8px;border-radius:50%;background:var(--orange);display:inline-block;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
/* 今募集中カード */
.sv .rc{background:var(--cream);border:2.5px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink);margin:0 18px 11px;padding:13px;display:flex;gap:11px;align-items:flex-start;text-decoration:none;color:inherit}
.sv .rc .e{font-size:23px;margin-top:1px}
.sv .rc .ttl{font-size:13.5px;font-weight:900}
.sv .rc .meta{font-size:11.5px;font-weight:700;color:#6b5440;margin-top:3px}
.sv .rc .tag{font-size:10.5px;font-weight:900;padding:3px 9px;border-radius:999px;border:2px solid var(--ink);white-space:nowrap;align-self:center;flex:none}
.sv .rc .tag.g{background:var(--teal);color:var(--cream)}.sv .rc .tag.o{background:var(--mustard)}
/* 追従バー（fixedで中央480px幅・.sv::before と同じ方式。コンテンツは wrap の下余白で逃がす） */
.sv .bar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;z-index:70;padding:11px 16px calc(11px + env(safe-area-inset-bottom));background:rgba(244,232,206,.96);backdrop-filter:blur(5px);border-top:2.5px solid var(--ink)}
.sv .bar .b2{display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;background:var(--orange);color:var(--cream);font-weight:900;font-size:16px;padding:15px;border:3px solid var(--ink);border-radius:16px;box-shadow:4px 4px 0 var(--ink)}
.sv .wrap{padding-bottom:88px}
`;

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDate(d?: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}(${WD[dt.getDay()]})`;
}

type LpCard = { id: string; title: string; drink: boolean; official: boolean; date: string; start: string; place: string; remaining: number; host: string };

// トップLPの「社会的証明」と「今募集中」を実データから作る。失敗しても LP 本体は必ず描画する。
async function getLpData(): Promise<{ cards: LpCard[]; openCount: number; activeNow: number }> {
  const now = Date.now();
  let cards: LpCard[] = [];
  let openCount = 0;
  let activeNow = 0;
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
    rounds.sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });
    openCount = rounds.length;
    const top = rounds.slice(0, 3);
    let names: Record<string, string> = {};
    try {
      const us = await db.listUsers(Array.from(new Set(top.map((r) => r.hostId).filter(Boolean))));
      names = Object.fromEntries(us.map((u) => [u.id, u.displayName || '']));
    } catch { /* noop */ }
    cards = top.map((r) => ({
      id: r.id,
      title: r.title,
      drink: r.eventType === 'drink',
      official: !!r.isOfficial,
      date: r.dateType === 'range' ? (r.dateRange || '日程調整中') : (r.date ? fmtDate(r.date) : '日程未定'),
      start: r.startTime || '',
      place: r.eventType === 'drink' ? (r.venue || r.area || '場所未定') : (r.courseName || r.area || 'エリア未定'),
      remaining: Math.max(0, r.maxSpots - r.currentCount),
      host: r.isOfficial ? '' : (names[r.hostId] || ''),
    }));
  } catch { /* DBが不調でもLPは出す */ }
  try {
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) {
      const agg = await adb.collection('users').where('lastActiveAt', '>=', now - 3600000).count().get();
      activeNow = agg.data().count || 0;
    }
  } catch { /* noop */ }
  return { cards, openCount, activeNow };
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
  const { cards, openCount, activeNow } = await getLpData();
  // 数字は少ないと逆効果なので、十分あるときだけ出す（実データ・虚偽なし）。
  const showOpen = openCount >= 3;
  const showActive = activeNow >= 3;
  const showProof = showOpen || showActive;
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
          <span className="free">20〜30代限定</span>
        </div>

        {/* ヒーロー */}
        <header className="hero">
          <div className="sun" aria-hidden="true" />
          <span className="lb">⛳ ゴルフ友達さがし</span>
          <h1>一緒に回る<br /><span className="hl">ゴルフ友達</span>が<br />見つかる。</h1>
          <p>
            誘える人がいなくても大丈夫。<br />
            一人で参加して、気の合う人と「ゴル友」になれます。
          </p>
        </header>

        {/* 上部CTA（ファーストビューで登録に進めるように） */}
        <div className="cta2">
          <StartButton className="p">💬 LINEで無料ではじめる</StartButton>
          <a className="s" href="#rounds">⛳ 募集中のラウンドを見る</a>
          <div className="mc">LINEログインのみ ・ 約30秒で完了 ・ アプリDL不要</div>
        </div>

        {/* 社会的証明（実データ・十分あるときだけ表示） */}
        {showProof && (
          <div className="proof">
            {showOpen && <span className="pchip t">⛳ いま募集中 <b>{openCount}</b>件</span>}
            {showActive && <span className="pchip o"><span className="live" /> 直近1時間 <b>{activeNow}</b>人</span>}
          </div>
        )}

        {/* 今募集中のラウンド（実データ・あるときだけ） */}
        {cards.length > 0 && (
          <>
            <div className="chap" id="rounds">
              <div className="no">⛳</div>
              <div>
                <div className="lb">ROUNDS</div>
                <div className="tt">今こんな募集が動いてます</div>
              </div>
            </div>
            {cards.map((c) => (
              <a className="rc" key={c.id} href={`${APP}/round/${c.id}`}>
                <span className="e">{c.drink ? '🍻' : c.official ? '🏆' : '⛳'}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ttl">{c.title}</div>
                  <div className="meta">📅 {c.date}{c.start ? ` ${c.start}` : ''} ・ 📍 {c.place}{c.host ? ` ・ 主催: ${c.host}` : ''}</div>
                </div>
                {c.drink
                  ? <span className="tag o">定員なし</span>
                  : c.remaining > 0 ? <span className="tag g">残り{c.remaining}枠</span> : <span className="tag o">満員</span>}
              </a>
            ))}
          </>
        )}

        {/* 前提バッジ（アプリDL不要・LINE完結） */}
        <div className="badges">
          <span className="bd"><b>📥 DL不要</b>アプリ入れずに使える</span>
          <span className="bd"><b>💬 LINEで完結</b>ログインも通知もLINE</span>
          <span className="bd"><b>⛳ 20〜30代</b>年代が近い人だけ</span>
          <span className="bd"><b>🔰 初心者OK</b>ラウンドデビューでも</span>
          <span className="bd"><b>🚗 送迎あり</b>車がなくても行ける</span>
        </div>

        {/* ラウンド投稿 */}
        <div className="chap">
          <div className="no">📝</div>
          <div>
            <div className="lb">POST</div>
            <div className="tt">まずは一緒に回る人を探す</div>
          </div>
        </div>
        <p className="lead">「行きたいけど、誘える人がいない」を無くす。募集を出すのも、参加するのも無料です。</p>
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

        {/* 初心者・ラウンドデビュー（「ゴルフ 初心者 ラウンド」等の検索意図に応える） */}
        <div className="chap">
          <div className="no">🔰</div>
          <div>
            <div className="lb">BEGINNER</div>
            <div className="tt">初心者もOK。<br />車がなくても行ける。</div>
          </div>
        </div>
        <p className="lead">ゴルフを始めにくい理由って、だいたいこの2つです。</p>
        <div className="card">
          <h3>🔰 初心者でも気にしなくていい</h3>
          <p>スコア帯は<b>「ラウンド未経験」「ラウンド数回」</b>から選べます。最初から相手に伝わるので、当日になって「実は初めてで…」と切り出す必要がありません。<b>「初心者歓迎」の募集</b>だけを絞り込んで探すこともできます。</p>
        </div>
        <div className="card">
          <h3>🚗 送迎の調整が、アプリの中で終わる</h3>
          <p>ゴルフ場は駅から遠い。でも<b>車がなくても大丈夫</b>です。</p>
          <p>募集する人は「送迎できる／しない」を選び、できる場合は<b>拾える駅と乗れる人数</b>を登録。参加する人は<b>申し込みのときに送迎の希望をその場で答える</b>だけです。</p>
          <p>あとは主催者から「<b>この駅で拾います</b>」と届きます。誰がどこから乗るかは専用の画面にまとまるので、<b>LINEで何往復もやり取りする必要がありません</b>。</p>
        </div>
        <div className="card">
          <h3>👩 女性も参加しやすい設計</h3>
          <p>募集ごとに<b>男女の枠</b>を決められて、探すときも性別の条件で絞り込めます。ラウンド後の相互レビューと20〜30代限定とあわせて、はじめてでも参加しやすくしています。</p>
        </div>

        {/* 相互レビュー */}
        <div className="chap">
          <div className="no">⭐</div>
          <div>
            <div className="lb">REVIEW</div>
            <div className="tt">初対面でも安心して回れる</div>
          </div>
        </div>
        <p className="lead">知らない人と回るのが不安、を無くすための仕組みです。</p>
        <div className="card">
          <h3>🤝 ラウンド後にお互いを評価</h3>
          <p>回り終わると、同じ組だった人をレビューできます。マナーの良い人が可視化されるので、はじめての参加でも安心です。</p>
        </div>
        <div className="card">
          <h3>⛳ 20〜30代だけのコミュニティ</h3>
          <p>年代が近い人しかいないので、はじめましてでもフラットに話せます。「気を使って疲れた」で終わりません。</p>
        </div>

        {/* また回りたい */}
        <div className="chap">
          <div className="no">🏌️</div>
          <div>
            <div className="lb">MATCH</div>
            <div className="tt">「また一緒に回りたい」で<br />ゴル友になる</div>
          </div>
        </div>
        <p className="lead">ここがゴルトモの中心。1回きりで終わらせず、次も誘い合える関係になります。</p>
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
          <div className="match">🎉 ゴル友成立 → メッセージでつながる</div>
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
        <p className="lead">ゴル友から先に進みたい人にも、同じ両想い方式が用意されています。</p>
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
          <h2>ゴルフ友達を<br />見つけにいく</h2>
          <p>登録は無料。アプリのダウンロードは要りません。<br />まずはLINEログインだけ。</p>
          <StartButton className="btn">LINEで始める →</StartButton>
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

        {/* 追従CTAバー（スクロール中も常に登録に進める） */}
        <div className="bar">
          <StartButton className="b2">💬 LINEで無料ではじめる</StartButton>
        </div>
      </div>
    </div>
  );
}
