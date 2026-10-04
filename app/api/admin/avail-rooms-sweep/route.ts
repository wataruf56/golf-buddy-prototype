import { NextRequest, NextResponse } from 'next/server';
import { sweepRooms } from '@/lib/availRooms';

// 運営用：人数がそろっているのに部屋が無い日を探して、チャット部屋を作る。
//   POST /api/admin/avail-rooms-sweep?token=XXX
// 基準人数を 4→3 に下げた直後（2026-10-04）に1回まわす。以後は押したときに自動で作られる。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const r = await sweepRooms();
  return NextResponse.json({ ok: true, ...r }, { headers: noStore });
}
