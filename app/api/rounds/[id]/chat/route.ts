import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// GET /api/rounds/[id]/chat — group chat for approved participants
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const messages = await db.listRoundMessages(params.id);
  return NextResponse.json({ messages, round }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const { text } = await req.json();
  if (!text || !String(text).trim()) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });
  const message = await db.addRoundMessage(params.id, meId, String(text).trim());
  return NextResponse.json({ message }, { headers: noStore });
}
