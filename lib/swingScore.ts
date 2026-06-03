// Machine-readable swing scoring, parsed out of the AI review text by the
// worker (same pattern as @SNAP snapshots). The visible review stays
// score-free (the prompts forbid inline scores); this block is appended at the
// very end purely for the score-trend graph + per-axis "課題の改善" bars, then
// stripped before the review is shown to the user.

// Fixed rubric axes — kept constant across analyses so the bars/trend stay
// comparable over time. Order = display order.
export const SWING_AXES = ['体重移動', '手打ちの抑制', '頭の位置', 'スイング軌道', 'テンポ'] as const;

// Instruction appended to every video-grounded prompt. Asks for a strict block.
export const SWING_SCORE_INSTRUCTION = [
  '',
  '━━━━━━━━━━━━━━',
  '',
  '🔢 スコア採点（機械処理用・本文には書かない）',
  '解説とは別に、このゴルファー本人のスイングを下記5項目で0〜100点で採点する。',
  '（プロ比較／過去比較／練習場vsラウンドでは「本人＝自分／今回／ラウンド」のスイングを採点する）',
  '100＝完璧、0＝大きな改善余地。total は5項目を踏まえた総合評価。',
  '出力の一番最後に、下記フォーマットだけで厳密に出力する（半角の = と整数のみ、各行1項目、説明文を加えない）：',
  '===SWINGSCORE===',
  'total=<0-100>',
  '体重移動=<0-100>',
  '手打ちの抑制=<0-100>',
  '頭の位置=<0-100>',
  'スイング軌道=<0-100>',
  'テンポ=<0-100>',
  '===END===',
  'この採点ブロック以外に点数・数値評価を本文へ書かないこと。',
].join('\n');

export type ParsedSwingScore = {
  score?: number;
  axes?: { label: string; value: number }[];
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Pull total + per-axis values out of the ===SWINGSCORE=== block. */
export function parseSwingScore(text: string): ParsedSwingScore {
  if (!text) return {};
  const block = /===SWINGSCORE===([\s\S]*?)(?:===END===|$)/i.exec(text);
  const scope = block ? block[1] : text;
  const num = (key: string): number | undefined => {
    const m = new RegExp(`${key}\\s*=\\s*(\\d{1,3})`).exec(scope);
    if (!m) return undefined;
    return clamp(parseInt(m[1], 10));
  };
  const total = num('total');
  const axes: { label: string; value: number }[] = [];
  for (const label of SWING_AXES) {
    const v = num(label);
    if (typeof v === 'number') axes.push({ label, value: v });
  }
  const out: ParsedSwingScore = {};
  if (typeof total === 'number') out.score = total;
  else if (axes.length) out.score = clamp(axes.reduce((s, a) => s + a.value, 0) / axes.length);
  if (axes.length) out.axes = axes;
  return out;
}

/** Remove the scoring block (and stray ===END===) from the displayed review. */
export function stripScoreSection(text: string): string {
  if (!text) return text;
  return text
    // Drop the appended "🔢 スコア採点" header + everything to the block start.
    .replace(/\n*━*\n*🔢[\s\S]*?(?====SWINGSCORE===)/i, '\n')
    .replace(/===SWINGSCORE===[\s\S]*?===END===/gi, '')
    .replace(/===SWINGSCORE===[\s\S]*$/i, '') // block without a closing ===END===
    .replace(/===END===/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
