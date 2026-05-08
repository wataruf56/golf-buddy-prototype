import { NextRequest, NextResponse } from 'next/server';
import { setSwingAllowed, listSwingAllowed } from '@/lib/swingAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// GET /api/admin/swing-allow?token=XXX → { ids: [...] }
export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const ids = await listSwingAllowed();
  return NextResponse.json({ ids }, { headers: noStore });
}

// POST /api/admin/swing-allow?token=XXX  body: { userId, allowed: boolean }
export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const userId = String(body?.userId || '').trim();
  const allowed = !!body?.allowed;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });
  try {
    await setSwingAllowed(userId, allowed);
    return NextResponse.json({ ok: true, userId, allowed }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
