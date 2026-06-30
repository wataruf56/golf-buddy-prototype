import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d?: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${dt.getMonth() + 1}/${dt.getDate()}（${days[dt.getDay()]}）`;
}

export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

// レビュー平均を常に小数点第一位で表示する（例: 5.0 / 4.9 / 4.8）。
export function formatRating(avg?: number): string {
  return (Math.round((avg || 0) * 10) / 10).toFixed(1);
}

// 個人のレビュー表示文字列。まだ1件もレビューがない人は「初参加」と出す。
// 例: "★4.8" / "★4.8（12件）" / "🆕 初参加"
export function ratingLabel(
  u: { reviewAvg?: number; reviewCount?: number } | null | undefined,
  opts: { count?: boolean; star?: boolean } = {},
): string {
  const star = opts.star !== false; // default: prefix with ★
  if (!u || !u.reviewCount) return '🆕 初参加';
  const base = `${star ? '★' : ''}${formatRating(u.reviewAvg)}`;
  return opts.count ? `${base}（${u.reviewCount}件）` : base;
}

// 車の有無を表す短いラベル（参加者一覧などで使用）。未設定は空文字。
export function carLabel(car?: 'have' | 'none'): string {
  if (car === 'have') return '🚗 車あり';
  if (car === 'none') return '🚶 車なし';
  return '';
}

// 金額表記の整形：¥記号を除き、円が無ければ付ける（"8000"→"8000円"、"¥8,000〜"→"8,000〜円"）。
function fmtYen(s?: string): string {
  if (!s) return '';
  const p = String(s).replace(/[¥￥]/g, '').trim();
  return p ? (p.includes('円') ? p : `${p}円`) : '';
}

type PriceFields = { price?: string; priceMale?: string; priceFemale?: string };

// 男女別料金が有効か（男性・女性の両方が入力されているとき）。
export function isSplitPrice(round: PriceFields): boolean {
  return !!(round.priceMale && round.priceFemale);
}

// 閲覧者の性別に応じた費用表示ラベル。男女別が無効なら price（同額）。
// 性別不明（主催者の自分・未設定）のときは男女両方を併記する。
export function priceLabelForGender(round: PriceFields, gender?: string): string {
  if (isSplitPrice(round)) {
    if (gender === 'female') return fmtYen(round.priceFemale);
    if (gender === 'male') return fmtYen(round.priceMale);
    return `👨 ${fmtYen(round.priceMale)} / 👩 ${fmtYen(round.priceFemale)}`;
  }
  return fmtYen(round.price);
}

// 検索フィルタ等で使う数値。閲覧者性別の金額（男女別時）または price を数値化。
export function priceValueForGender(round: PriceFields, gender?: string): number {
  const pick = isSplitPrice(round)
    ? (gender === 'female' ? round.priceFemale : round.priceMale)
    : round.price;
  const n = parseInt(String(pick || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : NaN;
}
