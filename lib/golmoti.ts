// ゴルフ性格診断「GOLMOTI」16タイプの共有データ（新軸版）。
// 軸：目的(G/E) × 社交(W/M) × 持ち味 飛距離P/技巧K × 向上心(T/I)。
// public/golmoti-chars/{code}.png に各タイプの動物キャラ画像がある。
// 出典は public/golmoti.html の NICK 定義と一致させること。

export type GolmotiType = {
  code: string;   // 例: 'GWPT'
  emoji: string;  // 動物の絵文字（フォールバック表示用）
  name: string;   // 「〜派」名
  animal: string; // 動物名
};

export const GOLMOTI_TYPES: GolmotiType[] = [
  { code: 'GWPT', emoji: '🐯', name: 'ぶっ飛ばしエース派', animal: 'トラ' },
  { code: 'GWPI', emoji: '🦁', name: '一発ロマン砲派', animal: 'ライオン' },
  { code: 'GWKT', emoji: '🐶', name: 'みんなで堅実・上達派', animal: 'イヌ' },
  { code: 'GWKI', emoji: '🦊', name: '賢く立ち回り派', animal: 'キツネ' },
  { code: 'GMPT', emoji: '🦅', name: '孤高の飛ばし屋派', animal: 'ワシ' },
  { code: 'GMPI', emoji: '🐆', name: '一撃必殺ハンター派', animal: 'ヒョウ' },
  { code: 'GMKT', emoji: '🐢', name: 'コツコツ精密派', animal: 'カメ' },
  { code: 'GMKI', emoji: '🦉', name: '黙々マイゴルフ派', animal: 'フクロウ' },
  { code: 'EWPT', emoji: '🐬', name: '楽しく伸びる飛ばし派', animal: 'イルカ' },
  { code: 'EWPI', emoji: '🐵', name: 'ノリ全開ドカン派', animal: 'サル' },
  { code: 'EWKT', emoji: '🦫', name: 'みんなでコツコツ派', animal: 'ビーバー' },
  { code: 'EWKI', emoji: '🐻', name: 'スコアより笑顔派', animal: 'クマ' },
  { code: 'EMPT', emoji: '🐺', name: '自由きまま飛ばし派', animal: 'オオカミ' },
  { code: 'EMPI', emoji: '🐱', name: '気分で大胆ショット派', animal: 'ネコ' },
  { code: 'EMKT', emoji: '🐹', name: 'コツコツ自分磨き派', animal: 'ハムスター' },
  { code: 'EMKI', emoji: '🦥', name: 'のんびりフェアウェイ散歩派', animal: 'ナマケモノ' },
];

const BY_CODE: Record<string, GolmotiType> = Object.fromEntries(
  GOLMOTI_TYPES.map((t) => [t.code, t])
);

export function getGolmotiType(code?: string | null): GolmotiType | undefined {
  if (!code) return undefined;
  return BY_CODE[code.toUpperCase().trim()];
}

// 各タイプの動物キャラ画像URL（透過PNG）。
export function golmotiImg(code: string): string {
  return `/golmoti-chars/${code}.png`;
}

// 診断ページ（共有結果／自分の結果）の URL。コード指定で結果を直接開ける。
export function golmotiUrl(code?: string): string {
  return code ? `/golmoti?type=${encodeURIComponent(code)}` : '/golmoti';
}
