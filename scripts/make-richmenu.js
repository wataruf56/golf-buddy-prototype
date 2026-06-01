// Generate the ゴルトモ rich menu image (2500×1686) as PNG from SVG via sharp.
// Polished design: gradient cards, large emoji in a soft circle, bold labels,
// subtle shadows, alternating accent so it reads as tappable buttons.
const sharp = require('sharp');

const W = 2500, H = 1686;
const COL = W / 3, ROW = H / 2;
const GAP = 28;

const cells = [
  { emoji: '🏠', label: 'ホーム',       sub: 'トップへ',     c1: '#34A85A', c2: '#2D8C4E' },
  { emoji: '🔍', label: 'さがす',       sub: '募集を探す',   c1: '#3AA0C9', c2: '#2E86AB' },
  { emoji: '⛳', label: 'スイング解析', sub: 'AIコーチ',     c1: '#46B36B', c2: '#2D8C4E' },
  { emoji: '✏️', label: '募集をつくる', sub: 'ラウンド企画', c1: '#E8943A', c2: '#D97E1E' },
  { emoji: '🤝', label: 'ゴル友',       sub: '仲間とつながる', c1: '#46B36B', c2: '#2D8C4E' },
  { emoji: '👤', label: 'マイページ',   sub: 'プロフィール', c1: '#7C6FE0', c2: '#5B4FC4' },
];

function cell(c, i) {
  const x = (i % 3) * COL + GAP;
  const y = Math.floor(i / 3) * ROW + GAP;
  const w = COL - GAP * 2;
  const h = ROW - GAP * 2;
  const cx = x + w / 2;
  const gid = `g${i}`;
  return `
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c.c1}"/>
        <stop offset="1" stop-color="${c.c2}"/>
      </linearGradient>
    </defs>
    <g>
      <rect x="${x}" y="${y + 8}" width="${w}" height="${h}" rx="48" fill="rgba(0,0,0,0.12)"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="48" fill="url(#${gid})"/>
      <circle cx="${cx}" cy="${y + h * 0.40}" r="135" fill="rgba(255,255,255,0.18)"/>
      <text x="${cx}" y="${y + h * 0.40}" font-size="170" text-anchor="middle" dominant-baseline="central">${c.emoji}</text>
      <text x="${cx}" y="${y + h * 0.74}" font-size="92" font-weight="800" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${c.label}</text>
      <text x="${cx}" y="${y + h * 0.86}" font-size="46" font-weight="600" fill="rgba(255,255,255,0.85)" text-anchor="middle" font-family="sans-serif">${c.sub}</text>
    </g>`;
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#F4F7F5"/>
  ${cells.map(cell).join('\n')}
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile('scripts/richmenu.png')
  .then((info) => console.log('richmenu.png written:', info.width + 'x' + info.height, info.size + 'bytes'))
  .catch((e) => { console.error('FAIL', e.message); process.exit(1); });
