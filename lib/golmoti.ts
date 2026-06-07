// ゴルフ性格診断「GOLMOTI」16タイプの共有データ。
// 出典は public/golmoti.html の NICK 定義（コード→絵文字/名前/タグライン/動物）。
// プロフィールの診断タイプ選択プルダウン・表示で使用する。

export type GolmotiType = {
  code: string;   // 例: 'GWST'（4軸の頭文字）
  emoji: string;  // 動物の絵文字
  name: string;   // 「〜派」名
  animal: string; // 動物名
};

export const GOLMOTI_TYPES: GolmotiType[] = [
  { code: 'GWST', emoji: '🐯', name: 'ピン一直線・攻め込み派', animal: 'トラ' },
  { code: 'GWSI', emoji: '🦁', name: 'とにかく飛ばしたい派', animal: 'ライオン' },
  { code: 'GWKT', emoji: '🦊', name: '計算して刻む派', animal: 'キツネ' },
  { code: 'GWKI', emoji: '🐶', name: '手堅くパー拾い派', animal: 'イヌ' },
  { code: 'GMST', emoji: '🦅', name: '黙って高み狙い派', animal: 'ワシ' },
  { code: 'GMSI', emoji: '🐆', name: '一発逆転ねらい派', animal: 'ヒョウ' },
  { code: 'GMKT', emoji: '🦉', name: '黙々スコアメイク派', animal: 'フクロウ' },
  { code: 'GMKI', emoji: '🐢', name: 'ブレずに安全運転派', animal: 'カメ' },
  { code: 'EWST', emoji: '🐬', name: '楽しく攻めて伸びる派', animal: 'イルカ' },
  { code: 'EWSI', emoji: '🐵', name: 'ノリで振り回す派', animal: 'サル' },
  { code: 'EWKT', emoji: '🦫', name: 'みんなでコツコツ上達派', animal: 'ビーバー' },
  { code: 'EWKI', emoji: '🐻', name: 'スコアより笑顔派', animal: 'クマ' },
  { code: 'EMST', emoji: '🐺', name: '自由きまま攻め派', animal: 'オオカミ' },
  { code: 'EMSI', emoji: '🐱', name: '気分で大胆ショット派', animal: 'ネコ' },
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

// 診断ページ（共有結果／自分の結果）の URL。コード指定で結果を直接開ける。
export function golmotiUrl(code?: string): string {
  return code ? `/golmoti?type=${encodeURIComponent(code)}` : '/golmoti';
}
