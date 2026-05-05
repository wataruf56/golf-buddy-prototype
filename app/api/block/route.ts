import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'Content-Type': 'application/json; charset=utf-8' };

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { userId, action } = await req.json();
  if (!userId || (action !== 'block' && action !== 'unblock')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  }
  if (userId === meId) return NextResponse.json({ error: 'cannot block self' }, { status: 400, headers: noStore });
  const blockedUserIds = await db.blockUser(meId, userId, action);
  return NextResponse.json({ blockedUserIds }, { headers: noStore });
}
