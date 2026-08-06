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

export const HASHTAGS = '#ゴルフラウンド #ゴルフ仲間募集 #ゴルフ初心者 #ゴルトモ #ラウンド募集';

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

export type CaptionInput = {
  round: Pick<Round, 'id' | 'title' | 'date' | 'startTime' | 'area' | 'courseName' | 'venue' | 'maxSpots' | 'currentCount'> & {
    isOfficial?: boolean;
  };
  /** 公式コンペのときだけ入れる補足（任意）。 */
  price?: string;
  womenPct?: number;
};

export function buildCaption(input: CaptionInput): string {
  const r = input.round;
  const place = r.courseName || r.venue || r.area || '未定';
  const rest = Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
  const date = fmtDate(r.date);
  const start = r.startTime ? ` ${r.startTime} START` : '';
  const area = r.area ? `（${r.area}）` : '';
  const price = input.price ? `\n💰 ${input.price}` : '';

  const stats = r.isOfficial
    ? [
        '',
        '▍いま参加している人のこと',
        '',
        `　参加確定　　　　${r.currentCount}名`,
        input.womenPct != null ? `　女性の参加率　　${input.womenPct}%` : '',
        `　リピート率　　　${COMMUNITY_STATS.repeatPct}%（${COMMUNITY_STATS.repeatWords}）`,
        `　平均スコア　　　男性 ${COMMUNITY_STATS.scoreMen} ／ 女性 ${COMMUNITY_STATS.scoreWomen}`,
        '',
        `女性のスコアは${COMMUNITY_STATS.scoreWomen}と幅があります。`,
        '上限側でも浮きません。むしろ、そのくらいの方が多いです。',
      ].filter(Boolean).join('\n')
    : [
        '',
        '▍どんな人が来ますか',
        '',
        `　リピート率　　　${COMMUNITY_STATS.repeatPct}%（${COMMUNITY_STATS.repeatWords}）`,
        `　平均スコア　　　男性 ${COMMUNITY_STATS.scoreMen} ／ 女性 ${COMMUNITY_STATS.scoreWomen}`,
      ].join('\n');

  return [
    '「ゴルフ行きたいけど、誘える人がいない」',
    '',
    'その1回目を、ここで。',
    '',
    '━━━━━━━━━━━━━━',
    '',
    `📅 ${date}${start}`,
    `📍 ${place}${area}`.trimEnd() + price,
    `👥 定員${r.maxSpots}名 ／ 残り${rest}名`,
    '',
    '━━━━━━━━━━━━━━',
    '',
    '▍20代・30代だけの、気楽なラウンドです',
    '',
    'ゴルフ初心者の方も歓迎です。',
    '「上手い人ばかりだったらどうしよう」',
    'という不安がいちばん多いので、先に数字を出しておきます。',
    stats,
    '',
    '▍車がなくても参加できます',
    '',
    '参加者同士のピックアップが可能です。',
    '「クルマがないから」で諦めていた方も、',
    '最寄り駅までお迎えに行けるのでご安心ください🚗',
    '',
    '▍参加方法',
    '',
    '① プロフィールのリンクから公式サイトへ',
    '②「募集中のラウンド」の中から',
    `　 ${date} ${place} を選択`,
    '③ そのままお申し込み',
    '',
    '質問だけでも、DMでお気軽にどうぞ。',
    '',
    `残り${rest}名です。`,
    '気になったら、早めにお声がけください ⛳️',
    '',
    '━━━━━━━━━━━━━━',
    '※画像はイメージです',
    HASHTAGS,
  ].join('\n');
}

/** 同じ状態の投稿を二重に提案しないための指紋。残枠が変われば別扱いになる。 */
export function captionSignature(roundId: string, rest: number): string {
  return `${roundId}:rest${rest}`;
}
