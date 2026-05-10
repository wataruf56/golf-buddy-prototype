import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { ScoreEntry } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/scores
// Body: { scores: { [userId: string]: number | null } }
//
// Any participant of the round (host OR approved applicant) may save scores
// for any participant — the user spec explicitly allows mutual editing
// because not everyone remembers their own number when the day's over.
//
// Saved scores are written to the round AND mirrored into each affected
// user's recentScores list so the profile "直近のスコア" updates without
// the user having to also edit their profile manually.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const participants = new Set<string>([round.hostId, ...(round.applicantIds || [])]);
  if (!participants.has(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const incoming = body?.scores;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return NextResponse.json({ error: 'scores object required' }, { status: 400, headers: noStore });
  }

  // Sanitise: only accept entries for participants, scores 30〜200 (or null
  // to clear). Anything outside that range is ignored — defensive against a
  // typo turning into a profile graph spike.
  const next: Record<string, number> = { ...(round.scores || {}) };
  const cleared = new Set<string>();
  const touched = new Set<string>();
  for (const [uid, val] of Object.entries(incoming)) {
    if (!participants.has(uid)) continue;
    if (val === null || val === '' || val === undefined) {
      if (uid in next) { delete next[uid]; cleared.add(uid); touched.add(uid); }
      continue;
    }
    const n = Number(val);
    if (!Number.isFinite(n)) continue;
    const rounded = Math.round(n);
    if (rounded < 30 || rounded > 200) continue;
    next[uid] = rounded;
    touched.add(uid);
  }

  await db.updateRound(round.id, { scores: next });

  // Mirror to each touched user's recentScores. The round date is what we
  // use as the entry date — falling back to today if the round was the
  // 'flexible' (date range) variant with no fixed date locked in yet.
  const today = new Date().toISOString().slice(0, 10);
  const date = round.date || today;
  await Promise.all(Array.from(touched).map(async (uid) => {
    const u = await db.getUser(uid);
    if (!u) return;
    const list: ScoreEntry[] = Array.isArray(u.recentScores) ? [...u.recentScores] : [];
    // Replace any existing entry for the same date so editing twice doesn't
    // create duplicates. If the score was cleared, just drop the entry.
    const idx = list.findIndex((e) => e.date === date);
    if (cleared.has(uid)) {
      if (idx >= 0) list.splice(idx, 1);
    } else {
      const score = next[uid];
      const entry: ScoreEntry = { score, date };
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
    }
    // Cap at 10, sorted newest first (matches profile-edit logic).
    const cleaned = list
      .filter((e) => e.score > 0 && e.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 10);
    await db.updateUser(uid, { recentScores: cleaned });
  }));

  return NextResponse.json({ ok: true, scores: next }, { headers: noStore });
}
