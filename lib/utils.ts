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

// 「また回りたい率」を5段階(0〜5・0.5刻み)の星に写像する。プロフィール上部の★と
// チャットヘッダーの★で同じ実装を使い、リアルタイム(track-record)で一致させる。
// roundedWith=レビューをくれた人数、neverCount=「ごめんなさい」を付けた人数。
export function revisitStar(roundedWith?: number, neverCount?: number): number {
  const rw = roundedWith || 0;
  if (rw <= 0) return 0;
  return Math.round((1 - (neverCount || 0) / rw) * 5 * 2) / 2;
}

// 「また回りたい率」ベースのリアルタイム評価ラベル。track-record（roundedWith=レビューを
// くれた人数、neverCount=ごめんなさい数）から算出。旧 ratingLabel(reviewAvg) の置き換え。
// レビューがまだ無ければ「🆕 初参加」。
export function revisitRatingLabel(
  r: { roundedWith?: number; neverCount?: number } | null | undefined,
  opts: { count?: boolean } = {},
): string {
  const rw = r?.roundedWith || 0;
  if (rw <= 0) return '🆕 初参加';
  const star = revisitStar(rw, r?.neverCount).toFixed(1);
  return opts.count ? `★${star}（${rw}）` : `★${star}`;
}

// ms タイムスタンプを「たった今 / ◯分前 / ◯時間前 / ◯日前 / M/D」の相対表記にする。
// 「見に来た人」の閲覧時刻などの表示用。7日以上前は日付（M/D）にフォールバック。
export function timeAgo(ms?: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 0) return 'たった今';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日前`;
  const dt = new Date(ms);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
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

// 金額表記の整形：¥記号を除き、数字は3桁カンマ区切り、円が無ければ付ける
// （"14900"→"14,900円"、"¥6000〜8000"→"6,000〜8,000円"）。
function fmtYen(s?: string): string {
  if (!s) return '';
  let p = String(s).replace(/[¥￥]/g, '').trim();
  if (!p) return '';
  // 連続する数字のかたまりごとに3桁区切りを入れる（範囲「〜」やレンジも保持）。
  p = p.replace(/\d{4,}/g, (n) => Number(n).toLocaleString('en-US'));
  return p.includes('円') ? p : `${p}円`;
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

// Instagram の入力（@付きハンドル / ハンドル / URL いずれか）を、開けるURLに正規化。
// タップすると（アプリがあれば）Instagramアプリでそのユーザーのページを開く。
export function instagramUrl(v?: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  const handle = s.replace(/^@/, '').replace(/^(www\.)?instagram\.com\//i, '').replace(/\/+$/, '').replace(/[^A-Za-z0-9._]/g, '');
  return handle ? `https://instagram.com/${handle}` : '';
}
