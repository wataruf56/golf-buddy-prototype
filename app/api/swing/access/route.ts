import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { isSwingAllowed } from '@/lib/swingAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/access — returns { allowed: boolean }
export async function GET() {
  const meId = await getMeId();
  const allowed = await isSwingAllowed(meId);
  return NextResponse.json({ allowed }, { headers: noStore });
}
