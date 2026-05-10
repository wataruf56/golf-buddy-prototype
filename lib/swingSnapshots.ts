// Parse @SNAP annotation lines emitted by the AI in the 📸 注目フレーム section.
// See SNAPSHOT_INSTRUCTION_BLOCK in lib/swingPrompts.ts for the producer format.
//
// Each line looks like:
//   @SNAP subject=pro, time=1.8, phase=トップ, body=右肘, x=0.45, y=0.32, caption=右肘が体から離れすぎている
//
// We're permissive on whitespace and accept full-width commas / equals because
// Gemini sometimes substitutes them in Japanese-heavy text.

import type { SwingSnapshot } from '@/types/swing';

const ALLOWED_SUBJECTS: SwingSnapshot['subject'][] = ['mine', 'pro', 'past', 'range', 'round'];

function normalize(s: string): string {
  return s.replace(/＝/g, '=').replace(/，/g, ',').replace(/　/g, ' ').trim();
}

function parseFloatSafe(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseSnapshots(reviewText: string): SwingSnapshot[] {
  if (!reviewText) return [];
  const out: SwingSnapshot[] = [];
  const lines = reviewText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line.startsWith('@SNAP')) continue;
    // Strip the "@SNAP" prefix and split on commas — but preserve commas in
    // caption=… by only splitting on the first occurrence of ",<key>=".
    const body = line.slice('@SNAP'.length).trim();
    // We only have one key (caption) that can contain commas. Trick: split on
    // /,\s*(?=[a-z]+=)/ so commas inside the caption value are preserved.
    const parts = body.split(/,\s*(?=[a-zA-Z]+\s*=)/);
    const kv: Record<string, string> = {};
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      if (key) kv[key] = value;
    }
    const subjectRaw = (kv.subject || '').toLowerCase() as SwingSnapshot['subject'];
    if (!ALLOWED_SUBJECTS.includes(subjectRaw)) continue;
    const timeSec = parseFloatSafe(kv.time);
    if (timeSec === undefined || timeSec < 0) continue;
    const x = parseFloatSafe(kv.x);
    const y = parseFloatSafe(kv.y);
    out.push({
      subject: subjectRaw,
      timeSec,
      phase: kv.phase || undefined,
      bodyPart: kv.body || undefined,
      x: x !== undefined && x >= 0 && x <= 1 ? x : undefined,
      y: y !== undefined && y >= 0 && y <= 1 ? y : undefined,
      caption: kv.caption || '',
    });
  }
  return out;
}

// Strip the entire "📸 注目フレーム" section from the displayed review text so
// the raw @SNAP lines don't appear in the regular chunked output. We render
// the snapshots separately as visual cards.
export function stripSnapshotSection(reviewText: string): string {
  if (!reviewText) return reviewText;
  // Remove from the 📸 heading up to the next ━━━ divider (or end of text).
  return reviewText.replace(/(?:^|\n)📸[^\n]*\n[\s\S]*?(?=\n━{3,}|$)/g, '').trim();
}

// Group snapshots into pairs for side-by-side display in comparison modes.
// A "pair" = two snapshots that share the same phase + body but have
// different subjects (e.g. pro vs mine, past vs mine, range vs round).
// Loose snapshots (no matching counterpart) are returned as singletons.
export type SnapshotPair = { left: SwingSnapshot; right?: SwingSnapshot };

export function pairSnapshots(snaps: SwingSnapshot[]): SnapshotPair[] {
  if (!snaps.length) return [];
  const used = new Set<number>();
  const pairs: SnapshotPair[] = [];
  for (let i = 0; i < snaps.length; i++) {
    if (used.has(i)) continue;
    const a = snaps[i];
    let bIdx = -1;
    for (let j = i + 1; j < snaps.length; j++) {
      if (used.has(j)) continue;
      const b = snaps[j];
      if (a.subject === b.subject) continue;
      const samePhase = (a.phase || '') === (b.phase || '');
      const sameBody = (a.bodyPart || '') === (b.bodyPart || '');
      if (samePhase || sameBody) { bIdx = j; break; }
    }
    if (bIdx >= 0) {
      used.add(i); used.add(bIdx);
      // Order: comparison "reference" first (pro/past/range), self/round second.
      const order: SwingSnapshot['subject'][] = ['pro', 'past', 'range', 'round', 'mine'];
      const oa = order.indexOf(a.subject);
      const ob = order.indexOf(snaps[bIdx].subject);
      if (oa <= ob) pairs.push({ left: a, right: snaps[bIdx] });
      else pairs.push({ left: snaps[bIdx], right: a });
    } else {
      used.add(i);
      pairs.push({ left: a });
    }
  }
  return pairs;
}
