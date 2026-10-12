// 行ける日の部屋に入るときの「あいさつ」（2026-10-12）。画面とサーバーの両方で使う（server-only は import しない）。
// 選ぶだけの3問（方面・予算・車）から、本人の発言として最初のあいさつを作る：
//   「ゆうきです！千葉方面・予算1.5万円まで・車出せます🚗 よろしくお願いします」
// 決まり文句に見えないよう、言い回しは7通り（INTRO_VARIANTS）からランダムに1つ選ぶ（画面で選んだ番号をそのまま送る＝見本と同じ文が入る）。
// 絵文字は実行時に作る（ビルドが定数の文字列をまとめるときに絵文字を二重エスケープする不具合の回避・2026-10-12）。
const CAR = String.fromCodePoint(0x1F697);
const PRAY = String.fromCodePoint(0x1F64F);
const GOLF = String.fromCodePoint(0x26F3);
const SMILE = String.fromCodePoint(0x1F60A);
const WAVE = String.fromCodePoint(0x1F44B);

export const INTRO_AREAS = ['千葉', '茨城', '埼玉', '神奈川', '東京', '栃木', '群馬', '静岡', 'どこでも'] as const;
export const INTRO_BUDGETS = [
  { key: '10k', label: '〜1万円', amount: '1万円' },
  { key: '15k', label: '〜1.5万円', amount: '1.5万円' },
  { key: '18k', label: '〜1.8万円', amount: '1.8万円' },
  { key: '20k', label: '〜2万円', amount: '2万円' },
  { key: 'any', label: 'こだわらない', amount: '' },
] as const;
export const INTRO_CARS = [
  { key: 'drive', label: `${CAR} 車を出せる` },
  { key: 'ride', label: '乗せてほしい' },
  { key: 'either', label: 'どちらでも' },
] as const;

export type IntroAnswer = { areas: string[]; budget: string; car: string };

// 言い回し1つぶん。選ばれた問いの部品だけを「方面 → 予算 → 車」の順につなぐ
type Variant = {
  open: (name: string) => string;
  area: (a: string) => string; areaAny: string;
  budget: (b: string) => string; budgetAny: string;
  car: { drive: string; ride: string; either: string };
  join: string; close: string;
};

const INTRO_VARIANTS: Variant[] = [
  { open: (n) => `${n}です！`, join: '・', close: ' よろしくお願いします',
    area: (a) => `${a}方面`, areaAny: '方面はどこでも',
    budget: (b) => `予算${b}まで`, budgetAny: '予算はこだわりません',
    car: { drive: `車出せます${CAR}`, ride: `車に乗せてもらえると助かります${PRAY}`, either: '車はどちらでも大丈夫です' } },
  { open: (n) => `はじめまして、${n}です${GOLF} `, join: '', close: ' よろしくお願いします！',
    area: (a) => `${a}方面だとうれしいです。`, areaAny: '場所はどこでも大丈夫です。',
    budget: (b) => `予算は${b}くらいまでで考えてます。`, budgetAny: '予算は特にこだわりません。',
    car: { drive: `車は出せます${CAR}`, ride: `車がないので、乗せてもらえると助かります${PRAY}`, either: '車はどちらでも合わせます。' } },
  { open: (n) => `${n}です、よろしくお願いします！`, join: '', close: '',
    area: (a) => `行くなら${a}あたりがいいなと思ってます。`, areaAny: '場所はどこでもOKです。',
    budget: (b) => `予算は${b}までだとありがたいです。`, budgetAny: '予算は気にしないので合わせます。',
    car: { drive: `車出せます${CAR}`, ride: `車がないので乗せてもらえるとうれしいです${PRAY}`, either: '車は出しても乗せてもらっても、どちらでも！' } },
  { open: (n) => `こんにちは、${n}です${SMILE} `, join: '', close: ' よろしくお願いします！',
    area: (a) => `${a}方面希望です。`, areaAny: '場所はどこでも行けます。',
    budget: (b) => `予算${b}以内だと助かります。`, budgetAny: '予算はこだわらないです。',
    car: { drive: `車出せるので乗り合わせもOKです${CAR}`, ride: `車がないので、どなたか乗せてもらえると助かります${PRAY}`, either: '車はどちらでも大丈夫です。' } },
  { open: (n) => `${n}です！この日ぜひ回りたいです${GOLF} `, join: '', close: ' よろしくお願いします！',
    area: (a) => `${a}方面がいいです。`, areaAny: '場所はおまかせします。',
    budget: (b) => `予算は${b}までが希望です。`, budgetAny: '予算はいくらでも大丈夫です。',
    car: { drive: `車出せます${CAR}`, ride: `車は乗せてもらえると助かります${PRAY}`, either: '車はどちらでもOKです。' } },
  { open: (n) => `よろしくお願いします、${n}です！`, join: '', close: '',
    area: (a) => `${a}方面だと行きやすいです。`, areaAny: 'どの方面でも行けます。',
    budget: (b) => `予算は${b}くらいまでだとうれしいです。`, budgetAny: '予算は特に決めてないです。',
    car: { drive: `車は出せます${CAR}`, ride: `車がないので、乗せてもらえるとありがたいです${PRAY}`, either: '車は出す・乗せてもらう、どちらでも大丈夫です。' } },
  { open: (n) => `${n}です${WAVE} `, join: '、', close: ' みなさんよろしくお願いします！',
    area: (a) => `${a}方面`, areaAny: '方面はどこでも',
    budget: (b) => `予算${b}まで`, budgetAny: '予算は気にしません',
    car: { drive: `車出せます${CAR}`, ride: `車は乗せてほしいです${PRAY}`, either: '車はどちらでも' } },
];
export const INTRO_VARIANT_COUNT = INTRO_VARIANTS.length;
export const randomIntroVariant = () => Math.floor(Math.random() * INTRO_VARIANTS.length);

/** 送る文を作る。選ばれていない問いは文に入れない。variant が範囲外ならランダム */
export function composeIntro(name: string, a: IntroAnswer, variant?: number): string {
  const v = INTRO_VARIANTS[Number.isInteger(variant) && variant! >= 0 && variant! < INTRO_VARIANTS.length ? variant! : randomIntroVariant()];
  const parts: string[] = [];
  const areas = (a.areas || []).filter((x) => (INTRO_AREAS as readonly string[]).includes(x));
  if (areas.includes('どこでも')) parts.push(v.areaAny);
  else if (areas.length) parts.push(v.area(areas.join('・')));
  const b = INTRO_BUDGETS.find((x) => x.key === a.budget);
  if (b) parts.push(b.amount ? v.budget(b.amount) : v.budgetAny);
  if (a.car === 'drive' || a.car === 'ride' || a.car === 'either') parts.push(v.car[a.car]);
  const open = v.open(name || 'メンバー');
  // 何も選ばなかったとき：書き出しに「よろしく」が無ければ締めを足す（重ねない）
  const close = parts.length ? v.close : (open.includes('よろしく') ? '' : (v.close || ' よろしくお願いします！'));
  return `${open}${parts.join(v.join)}${close}`.replace(/\s+/g, ' ').replace(/！ /g, '！').trim();
}
