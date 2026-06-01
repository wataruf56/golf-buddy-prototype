// Generate the ゴルトモ rich menu image (2500×1686) as PNG from SVG via sharp.
// Layout: 2 rows × 3 columns = 6 tappable areas.
//   Row1: ホーム | 募集をさがす | スイング解析
//   Row2: 募集を作る | ゴル友 | マイページ
const sharp = require('sharp');
const fs = require('fs');

const W = 2500, H = 1686;
const COL = W / 3, ROW = H / 2;
const GREEN = '#2D8C4E', GREEN_D = '#246b3d', WHITE = '#ffffff';

const cells = [
  { emoji: '🏠', label: 'ホーム', tint: GREEN },
  { emoji: '🔍', label: 'さがす', tint: GREEN_D },
  { emoji: '⛳', label: 'スイング解析', tint: GREEN },
  { emoji: '➕', label: '募集を作る', tint: GREEN_D },
  { emoji: '🤝', label: 'ゴル友', tint: GREEN },
  { emoji: '👤', label: 'マイページ', tint: GREEN_D },
];

function cellSvg(c, i) {
  const cx = (i % 3) * COL;
  const cy = Math.floor(i / 3) * ROW;
  const centerX = cx + COL / 2;
  return `
    <g>
      <rect x="${cx + 8}" y="${cy + 8}" width="${COL - 16}" height="${ROW - 16}" rx="36" fill="${c.tint}"/>
      <text x="${centerX}" y="${cy + ROW / 2 - 30}" font-size="220" text-anchor="middle" dominant-baseline="middle">${c.emoji}</text>
      <text x="${centerX}" y="${cy + ROW / 2 + 170}" font-size="84" font-weight="700" fill="${WHITE}" text-anchor="middle" font-family="sans-serif">${c.label}</text>
    </g>`;
}

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${cells.map(cellSvg).join('\n')}
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile('scripts/richmenu.png')
  .then((info) => console.log('richmenu.png written:', info.width + 'x' + info.height, info.size + 'bytes'))
  .catch((e) => { console.error('FAIL', e.message); process.exit(1); });
