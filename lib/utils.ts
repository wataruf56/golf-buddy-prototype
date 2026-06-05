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
