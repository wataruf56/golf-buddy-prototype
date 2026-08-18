import 'server-only';
import type { Round } from '@/lib/types';

// Instagram のキャプション生成。
//
// ★ 文面を変えたいときはこのファイルだけ直せばよい。ロジックには触れなくて済むように
//   テンプレートを上に固めてある。管理画面（/admin/ig）からも1件ずつ編集できる。

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** コミュニティ全体の数値。実測が変わったらここを更新する。 */
export const COMMUNITY_STATS = {
  repeatPct: 65,
  repeatWords: '3人に2人が再参加',
  scoreMen: '95前後',
  scoreWomen: '110〜130',
};

export const HASHTAGS = '#ゴルフラウンド #ゴルフ仲間 #ゴルフ初心者 #ゴルトモ #ラウンド募集';

// Cloud Run は UTC で動くため、Date のローカル getter を使うと日付が1日ずれる。
// YYYY-MM-DD をそのまま数値として扱い、曜日だけ UTC で求める。
function fmtDate(iso?: string): string {
  if (!iso) return '日程調整中';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return `${mo}/${d}(${WD[wd]})`;
}

/** 16時以降スタートはナイター。ラウンドの設定を増やさなくても判定できる。 */
function isNight(start?: string): boolean {
  const h = Number(String(start || '').split(':')[0]);
  return Number.isFinite(h) && h >= 15;
}

/** 参加確定メンバーの男女内訳。RoundCard と同じ数え方（主催者＋承認済み＋知り合い枠）。 */
export type GenderMix = { male: number; female: number };

export type CaptionInput = {
  round: Pick<Round, 'id' | 'title' | 'date' | 'startTime' | 'area' | 'courseName' | 'venue' | 'maxSpots' | 'currentCount'> & {
    isOfficial?: boolean;
  };
  /** 公式コンペのときだけ入れる補足（任意）。 */
  price?: string;
  womenPct?: number;
  /** 参加者の男女内訳。埋まり具合を外から見えるようにするために出す。 */
  mix?: GenderMix;
  /** そのラウンド固有の一言（「ナイター」「男女6:6で募集」など）。 */
  note?: string;
};

// 本文は短くする方針（2026-08-07 に約550字→約300字へ）。
// Instagram は約2行で折り畳まれるので、日付と残り枠を先頭に置いて
// 「…続きを読む」を押す前に伝わるようにしている。
// リピート率・女性比率といった「初心者でも浮きません」の証明は
// カルーセル投稿「ゴルトモに参加してる人はこんな人です」に寄せた。
export function buildCaption(input: CaptionInput): string {
  const r = input.round;
  const place = r.courseName || r.venue || r.area || '未定';
  const rest = Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
  const date = fmtDate(r.date);
  const night = isNight(r.startTime) ? '🌙 ナイター ' : '';
  const start = r.startTime ? ` ${night}${r.startTime} START` : '';
  const area = r.area ? `（${r.area}）` : '';

  return [
    `${date}${r.area ? ` ${r.area}` : ''}、あと${rest}名です。`,
    '',
    '20代・30代だけの、気楽なラウンドです。',
    '',
    `📅 ${date}${start}`,
    `📍 ${place}${area}`.trimEnd(),
    `👥 定員${r.maxSpots}名 / 残り${rest}名`,
    input.mix ? `　　いま男性${input.mix.male}名 ・ 女性${input.mix.female}名` : '',
    input.note ? `✨ ${input.note}` : '',
    input.price ? `💰 ${input.price}` : '',
    '',
    '「上手い人ばかりだったらどうしよう」がいちばん多い不安なので、先に数字を。',
    `平均スコアは男性${COMMUNITY_STATS.scoreMen}、女性${COMMUNITY_STATS.scoreWomen}。ガチ勢の集まりではありません。`,
    '',
    '車がなくても、最寄り駅までのピックアップを調整できます🚗',
    '',
    'お申し込みはプロフィールのリンクから。質問だけでもDMどうぞ。',
    '',
    '※写真はイメージです',
    HASHTAGS,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** 同じ状態の投稿を二重に提案しないための指紋。残枠が変われば別扱いになる。 */
export function captionSignature(roundId: string, rest: number): string {
  return `${roundId}:rest${rest}`;
}

/** 満員のお知らせは1ラウンドにつき1回だけ。 */
export function fullSignature(roundId: string): string {
  return `${roundId}:full`;
}

// 満員になったラウンドのお知らせ。
// 「埋まっている」ことが外から見えるようにするための投稿なので、
// 募集はせず、次の募集へ誘導する。
export function buildFullCaption(input: CaptionInput): string {
  const r = input.round;
  const place = r.courseName || r.venue || r.area || '未定';
  const date = fmtDate(r.date);
  const night = isNight(r.startTime) ? '🌙 ナイター ' : '';
  const start = r.startTime ? ` ${night}${r.startTime} START` : '';
  const area = r.area ? `（${r.area}）` : '';

  return [
    `${date}${r.area ? ` ${r.area}` : ''}、満員になりました。`,
    '',
    'ありがとうございます。',
    '',
    `📅 ${date}${start}`,
    `📍 ${place}${area}`.trimEnd(),
    `👥 ${r.maxSpots}名 満員`,
    input.mix ? `　　男性${input.mix.male}名 ・ 女性${input.mix.female}名` : '',
    input.note ? `✨ ${input.note}` : '',
    '',
    '20代・30代だけの、気楽なラウンドです。',
    'ほかの日程はまだ空きがあります。',
    '',
    'お申し込みはプロフィールのリンクから。質問だけでもDMどうぞ。',
    '',
    '※写真はイメージです',
    HASHTAGS,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
