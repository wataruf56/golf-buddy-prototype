import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSwingQuota } from '@/lib/swingQuota';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/quota
// Returns the caller's monthly free-quota status so the swing UI can render
// a "今月: X / Y 回" badge and an upgrade prompt when used up.
export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const status = await getSwingQuota(meId);
  return NextResponse.json(status, { headers: noStore });
}
