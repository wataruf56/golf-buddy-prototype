// 異性として気になる（romantic）マッチの「会い方」複数選択の選択肢。
// 片方が「OKな会い方」を複数選ぶ → 相手はそのうち行ってもいいものだけ選ぶ →
// 両者が選んだものの重なりが「お互いOKな会い方」。いきなり二人で会うのが不安でも、
// カフェ/複数で など軽い選択肢から入れるようにするのが狙い。
// クライアント（画面）とサーバー（API）の両方から参照するため server-only にしない。
export const MEET_OPTIONS: { key: string; emoji: string; label: string }[] = [
  { key: 'round2', emoji: '🏌️', label: '二人でラウンド' },
  { key: 'roundN', emoji: '👥', label: '複数人でラウンド' },
  { key: 'cafe', emoji: '☕', label: 'カフェやランチ' },
  { key: 'meal', emoji: '🍽', label: 'ご飯や飲み' },
  { key: 'range2', emoji: '🎯', label: '二人で打ちっぱなし' },
  { key: 'sim2', emoji: '🕹️', label: '二人でシミュレーションゴルフ' },
  { key: 'simN', emoji: '🎮', label: '複数でシミュレーションゴルフ' },
];

export const MEET_KEYS = MEET_OPTIONS.map((o) => o.key);

// キー配列を「二人でラウンド・カフェやランチ」のような表示ラベルに（定義順を保つ）。
export function meetLabelOf(keys?: string[]): string {
  const s = keys || [];
  const l = MEET_OPTIONS.filter((o) => s.includes(o.key)).map((o) => o.label).join('・');
  return l || '未設定';
}
