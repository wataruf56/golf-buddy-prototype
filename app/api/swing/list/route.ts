import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { listSwingsForUser } from '@/lib/swingFirestore';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const swings = await listSwingsForUser(meId, 50);
  return NextResponse.json({ swings }, { headers: noStore });
}
