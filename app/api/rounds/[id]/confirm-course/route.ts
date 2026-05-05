import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (round.hostId !== meId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const { courseName, date, startTime, price } = body || {};
  if (!courseName || !date || !startTime) {
    return NextResponse.json({ error: 'missing required fields' }, { status: 400 });
  }
  try {
    const updated = await db.confirmCourse(params.id, { courseName, date, startTime, price });
    return NextResponse.json({ round: updated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
