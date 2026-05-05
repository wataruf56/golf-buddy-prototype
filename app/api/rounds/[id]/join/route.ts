import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Block: if the host has blocked me, hide the application.
  const host = await db.getUser(existing.hostId);
  if ((host?.blockedUserIds || []).includes(meId)) {
    return NextResponse.json({ error: 'blocked_by_host' }, { status: 403 });
  }
  const round = await db.joinRound(params.id, meId);
  return NextResponse.json({ round });
}
