import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { listSwingsForUser } from '@/lib/swingFirestore';
import { isSwingAllowed } from '@/lib/swingAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!isSwingAllowed(meId)) return NextResponse.json({ error: 'beta_only', swings: [] }, { status: 403, headers: noStore });
  const swings = await listSwingsForUser(meId, 50);
  return NextResponse.json({ swings }, { headers: noStore });
}
