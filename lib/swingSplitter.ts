// Splits the analyzer output by the ━━━ divider into UI-renderable chunks.
// Mirrors gas/60_worker.js レビュー分割_().
// Question-mode output has no divider → single-element array.

export function splitReviewByDivider(text: string): string[] {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const splitRe = /\n*━{3,}\n*/g;
  const parts = raw
    .split(splitRe)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
  if (parts.length === 0) return [raw];
  return parts;
}
