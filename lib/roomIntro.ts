// 行ける日の部屋に入るときの「ひとこと」（2026-10-12）。画面とサーバーの両方で使う（server-only は import しない）。
// 選ぶだけの3問（方面・予算・車）から、本人の発言として最初のあいさつを作る：
//   「ゆうきです！千葉方面・予算1.5万円まで・車出せます🚗 よろしくお願いします」
// 絵文字は実行時に作る（ビルドが定数の文字列をまとめるときに絵文字を二重エスケープする不具合の回避・2026-10-12）。
const CAR_EMOJI = String.fromCodePoint(0x1F697);
const PRAY_EMOJI = String.fromCodePoint(0x1F64F);

export const INTRO_AREAS = ['千葉', '茨城', '埼玉', '神奈川', '東京', '栃木', '群馬', '静岡', 'どこでも'] as const;
export const INTRO_BUDGETS = [
  { key: '10k', label: '〜1万円', phrase: '予算1万円まで' },
  { key: '15k', label: '〜1.5万円', phrase: '予算1.5万円まで' },
  { key: '18k', label: '〜1.8万円', phrase: '予算1.8万円まで' },
  { key: '20k', label: '〜2万円', phrase: '予算2万円まで' },
  { key: 'any', label: 'こだわらない', phrase: '予算はこだわりません' },
] as const;
export const INTRO_CARS = [
  { key: 'drive', label: '🚗 車を出せる', phrase: `車出せます${CAR_EMOJI}` },
  { key: 'ride', label: '乗せてほしい', phrase: `車に乗せてもらえると助かります${PRAY_EMOJI}` },
  { key: 'either', label: 'どちらでも', phrase: '車はどちらでも大丈夫です' },
] as const;

export type IntroAnswer = { areas: string[]; budget: string; car: string };

/** 送る文を作る。選ばれていない問いは文に入れない */
export function composeIntro(name: string, a: IntroAnswer): string {
  const parts: string[] = [];
  const areas = (a.areas || []).filter((x) => (INTRO_AREAS as readonly string[]).includes(x));
  if (areas.includes('どこでも')) parts.push('方面はどこでも');
  else if (areas.length) parts.push(`${areas.join('・')}方面`);
  const b = INTRO_BUDGETS.find((x) => x.key === a.budget);
  if (b) parts.push(b.phrase);
  const c = INTRO_CARS.find((x) => x.key === a.car);
  if (c) parts.push(c.phrase);
  const head = `${name || 'メンバー'}です！`;
  return parts.length ? `${head}${parts.join('・')} よろしくお願いします` : `${head}よろしくお願いします`;
}
