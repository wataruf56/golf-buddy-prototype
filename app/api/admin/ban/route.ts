import { NextRequest, NextResponse } from 'next/server';
import { setBanned, listBanned } from '@/lib/banAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// GET /api/admin/ban?token=XXX → { ids: [...] }  (currently banned user ids)
export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const ids = await listBanned();
  return NextResponse.json({ ids }, { headers: noStore });
}

// POST /api/admin/ban?token=XXX  body: { userId, banned: boolean }
export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const userId = String(body?.userId || '').trim();
  const banned = !!body?.banned;
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });
  try {
    await setBanned(userId, banned);
    return NextResponse.json({ ok: true, userId, banned }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
