import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSwing } from '@/lib/swingFirestore';
import { isSwingAllowed } from '@/lib/swingAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/[id] — used for polling on the result page.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await isSwingAllowed(meId))) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });
  const swing = await getSwing(meId, params.id);
  if (!swing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ swing }, { headers: noStore });
}
