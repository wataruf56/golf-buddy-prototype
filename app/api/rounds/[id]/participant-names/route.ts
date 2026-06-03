import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/rounds/[id]/participant-names
// Host-only. Returns the kanji full names of the round's participants
// (host + approved + pending applicants) so the host can register everyone at
// the golf course. Real names are private and stripped from every other API;
// this endpoint is the ONLY way they're exposed, and only to the host.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const ids = Array.from(new Set([
    round.hostId,
    ...(round.applicantIds || []),
    ...(round.pendingApplicantIds || []),
  ])).filter(Boolean);

  const users = await db.listUsers(ids);
  const names: Record<string, string> = {};
  for (const u of users) {
    const full = [u.realNameLast, u.realNameFirst].filter(Boolean).join(' ').trim();
    if (full) names[u.id] = full;
  }

  return NextResponse.json({ names }, { headers: noStore });
}
