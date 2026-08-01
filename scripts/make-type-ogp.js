// ゴルフ版MBTI 16タイプの OGP 画像（1200×630）を生成する。
//
//   node scripts/make-type-ogp.js
//   → public/ogp-type/{CODE}.png を16枚出力
//
// 各タイプページ /type/[code] が og:image に使う。これが無いと16ページ全部が
// 共通の ogp-golmoti.png になり、SNSでどのタイプをシェアしても同じ絵が出てしまう。
//
// タイプ名・愛称・軸ラベルは lib/golmoti.ts から読む（二重管理しない）。
// レンダリングは Chrome ヘッドレス（共通OGP ogp-golmoti.png と同じ方式）。
// 配色・書体は public/golmoti.html / tailwind.config.ts のブランドトークンに合わせている。

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'ogp-type');
const CHARS_DIR = path.join(ROOT, 'public', 'golmoti-chars');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome/Edge が見つかりません');

// --- lib/golmoti.ts からタイプ情報を読む -----------------------------------
const ts = fs.readFileSync(path.join(ROOT, 'lib', 'golmoti.ts'), 'utf8');

const TYPES = [...ts.matchAll(
  /\{ code: '([A-Z]{4})', emoji: '([^']*)', name: '([^']*)', animal: '([^']*)' \}/g
)].map((m) => ({ code: m[1], emoji: m[2], name: m[3], animal: m[4] }));
if (TYPES.length !== 16) throw new Error(`タイプが16件ではない: ${TYPES.length}`);

// tagline（一行キャッチ）
const TAGLINE = {};
for (const m of ts.matchAll(/^  ([A-Z]{4}): \{\n\s*tagline: '((?:[^'\\]|\\.)*)'/gm)) {
  TAGLINE[m[1]] = m[2].replace(/\\'/g, "'");
}

// 軸ラベル（コードの1〜4文字目 → 日本語ラベル）
const AXIS = {
  G: 'ガチ', E: 'エンジョイ', W: 'ワイワイ', M: 'マイペース',
  P: '飛距離', K: '技巧', T: '探求', I: '今満喫',
};
const axisLine = (code) => [...code].map((c) => AXIS[c]).join('・');

// --- HTML テンプレート ------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function html(t) {
  const charB64 = fs.readFileSync(path.join(CHARS_DIR, `${t.code}.png`)).toString('base64');
  // タイプ名は7〜13文字と幅がある（「コツコツ精密派」〜「のんびりフェアウェイ散歩派」）。
  // 和文はほぼ1文字=1emなので、左カラムの実効幅620pxに1行で収まるサイズを出す。
  // 折り返すと「派」だけが2行目に落ちて格好がつかないため nowrap で1行に固定する。
  const nameSize = Math.min(74, Math.floor(620 / t.name.length));

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700;900&family=Baloo+2:wght@700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{
    font-family:'Zen Maru Gothic',sans-serif;color:#33271B;background:#F4E8CE;
    position:relative;display:flex;align-items:center;
  }
  /* site と同じドットの地紋 */
  body::before{
    content:"";position:absolute;inset:0;opacity:.45;mix-blend-mode:multiply;
    background-image:radial-gradient(circle,rgba(51,39,27,.16) 1px,transparent 1.4px);
    background-size:7px 7px;
  }
  /* 右上の陽光（共通OGPと同じモチーフ） */
  .sun{
    position:absolute;top:-150px;right:-150px;width:520px;height:520px;border-radius:50%;
    background:repeating-conic-gradient(#E8A93C 0 12deg,transparent 12deg 24deg);opacity:.38;
  }
  .left{position:relative;z-index:2;padding:0 0 0 68px;width:700px}
  .pill{
    display:inline-block;background:#2A8C82;color:#FBF3E0;font-weight:900;font-size:23px;
    padding:9px 22px;border-radius:999px;border:3px solid #33271B;
  }
  .code{
    display:inline-block;background:#E8A93C;border:3px solid #33271B;border-radius:999px;
    font-family:'Baloo 2',cursive;font-weight:800;font-size:27px;padding:2px 20px;
    letter-spacing:.06em;margin:26px 0 10px;
  }
  h1{font-size:${nameSize}px;font-weight:900;line-height:1.14;letter-spacing:-.01em;white-space:nowrap}
  .tag{font-size:26px;font-weight:700;color:#6b5a44;margin-top:16px;line-height:1.45}
  .axis{
    margin-top:22px;font-size:21px;font-weight:900;color:#2A8C82;
    display:inline-block;background:#FBF3E0;border:3px solid #33271B;border-radius:14px;
    padding:8px 18px;box-shadow:4px 4px 0 #33271B;
  }
  .brand{
    position:absolute;left:68px;bottom:44px;z-index:2;
    font-size:25px;font-weight:900;color:#E8643C;letter-spacing:.02em;
  }
  .brand small{color:#6b5a44;font-size:19px;font-weight:700;margin-left:12px}
  .right{position:relative;z-index:2;width:500px;display:flex;justify-content:center}
  .right img{width:430px;height:430px;object-fit:contain;filter:drop-shadow(10px 10px 0 rgba(51,39,27,.18))}
</style></head><body>
  <div class="sun"></div>
  <div class="left">
    <span class="pill">⛳ ゴルフ版MBTI・16タイプ性格診断</span>
    <div><span class="code">${esc(t.code)}</span></div>
    <h1>${esc(t.name)}</h1>
    <div class="tag">${esc(TAGLINE[t.code] || '')}</div>
    <div class="axis">${esc(axisLine(t.code))}</div>
  </div>
  <div class="right"><img src="data:image/png;base64,${charB64}" alt=""></div>
  <div class="brand">⛳ ゴルトモ<small>goltomo.com</small></div>
</body></html>`;
}

// --- 生成 -------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-'));

for (const t of TYPES) {
  const htmlPath = path.join(tmp, `${t.code}.html`);
  fs.writeFileSync(htmlPath, html(t), 'utf8');

  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    // フォント（Google Fonts）とレイアウトが確定してから撮る
    '--virtual-time-budget=12000',
    `--screenshot=${path.join(OUT_DIR, `${t.code}.png`)}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });

  const size = fs.statSync(path.join(OUT_DIR, `${t.code}.png`)).size;
  console.log(`  ${t.code}  ${t.name}  (${Math.round(size / 1024)} KB)`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n✅ ${TYPES.length} 枚を ${path.relative(ROOT, OUT_DIR)} に出力しました`);
