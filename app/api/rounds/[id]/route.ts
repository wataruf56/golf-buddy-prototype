import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Returns a single round plus the participant users (host + approved/pending
// applicants) so the round-detail page can render even when the caller's
// store-side bootstrap filtered this round out (e.g. a friend who arrived
// via a shared link before completing profile registration — bootstrap's
// cohort filter would otherwise leave their store.rounds empty).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const userIds = new Set<string>([round.hostId]);
  for (const a of round.applicantIds || []) userIds.add(a);
  for (const a of round.pendingApplicantIds || []) userIds.add(a);
  const users = await db.listUsers(Array.from(userIds));
  return NextResponse.json({ round, users });
}
