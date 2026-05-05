import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = await db.getUser(meId);
  return NextResponse.json({ me });
}

export async function PATCH(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const allowed = ['displayName', 'age', 'area', 'scoreRange', 'playStyle', 'frequency', 'avatar', 'avatarUrl'];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) patch[key] = body[key];
  await db.updateUser(meId, patch as any);
  const me = await db.getUser(meId);
  return NextResponse.json({ me });
}
