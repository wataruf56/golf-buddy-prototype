import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

async function ensureParticipant(roundId: string, meId: string) {
  const round = await db.getRound(roundId);
  if (!round) return { error: NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore }) };
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore }) };
  return { round };
}

// GET /api/rounds/[id]/threads — list threads (participants only)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const chk = await ensureParticipant(params.id, meId);
  if (chk.error) return chk.error;
  const threads = await db.listRoundThreads(params.id);
  return NextResponse.json({ threads }, { headers: noStore });
}

// POST /api/rounds/[id]/threads { name } — create a named thread
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const chk = await ensureParticipant(params.id, meId);
  if (chk.error) return chk.error;

  let name = '';
  try { name = String((await req.json())?.name || '').trim(); } catch {}
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400, headers: noStore });
  name = name.slice(0, 40);

  const thread = await db.createRoundThread(params.id, name, meId);
  return NextResponse.json({ thread }, { headers: noStore });
}
