// Generate the ゴルトモ LINE official-account profile image (640×640 PNG).
// Square, bold, instantly readable at the tiny avatar size LINE shows in chat
// lists: a fresh green gradient, a golf flag/ball mark in a soft white disc,
// and the ゴルトモ wordmark beneath.
const sharp = require('sharp');

const S = 640;
const cx = S / 2;

const svg = `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3FBF6A"/>
      <stop offset="0.55" stop-color="#2FA257"/>
      <stop offset="1" stop-color="#1F7E41"/>
    </linearGradient>
    <radialGradient id="disc" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#EAF6EE"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000000" flood-opacity="0.18"/>
    </filter>
  </defs>

  <!-- background -->
  <rect width="${S}" height="${S}" fill="url(#bg)"/>

  <!-- subtle rolling-green arcs for depth -->
  <path d="M0 470 Q ${cx} 380 ${S} 470 L ${S} ${S} L 0 ${S} Z" fill="#1C7A3E" opacity="0.45"/>
  <path d="M0 520 Q ${cx} 440 ${S} 520 L ${S} ${S} L 0 ${S} Z" fill="#176A35" opacity="0.55"/>

  <!-- white disc holding the mark -->
  <circle cx="${cx}" cy="248" r="150" fill="url(#disc)" filter="url(#soft)"/>

  <!-- golf flag + hole + ball -->
  <!-- hole -->
  <ellipse cx="${cx + 8}" cy="330" rx="58" ry="16" fill="#2FA257" opacity="0.35"/>
  <!-- flag pole -->
  <rect x="${cx + 30}" y="160" width="9" height="165" rx="4.5" fill="#3A3A3A"/>
  <!-- pennant -->
  <path d="M ${cx + 39} 165 L ${cx + 132} 192 L ${cx + 39} 222 Z" fill="#E8442E"/>
  <!-- golf ball -->
  <circle cx="${cx - 52}" cy="300" r="40" fill="#ffffff" stroke="#D7E5DC" stroke-width="2"/>
  <circle cx="${cx - 64}" cy="292" r="4.2" fill="#C9D8CF"/>
  <circle cx="${cx - 48}" cy="290" r="4.2" fill="#C9D8CF"/>
  <circle cx="${cx - 40}" cy="304" r="4.2" fill="#C9D8CF"/>
  <circle cx="${cx - 58}" cy="308" r="4.2" fill="#C9D8CF"/>

  <!-- wordmark -->
  <text x="${cx}" y="500" font-size="118" font-weight="900" fill="#ffffff"
        text-anchor="middle" font-family="'Hiragino Sans','Yu Gothic',sans-serif"
        letter-spacing="2">ゴルトモ</text>
  <text x="${cx}" y="560" font-size="34" font-weight="700" fill="rgba(255,255,255,0.92)"
        text-anchor="middle" font-family="sans-serif" letter-spacing="6">GOLF MATCHING</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile('scripts/oa-icon.png')
  .then((info) => console.log('oa-icon.png written:', info.width + 'x' + info.height, info.size + 'bytes'))
  .catch((e) => { console.error('FAIL', e.message); process.exit(1); });
