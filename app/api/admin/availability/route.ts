import { NextRequest, NextResponse } from 'next/server';
import { listAvailabilityForAdmin } from '@/lib/availability';

// 管理画面：日付ごとに「誰が行けるか」を名前・年齢・性別・車・エリア・最寄り駅つきで返す。
// 運営がここを見て、コースの予約とピックアップの調整をする。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const includeTest = new URL(req.url).searchParams.get('includeTest') === '1';
  const r = await listAvailabilityForAdmin({ includeTest });
  return NextResponse.json({ generatedAt: Date.now(), ...r }, { headers: noStore });
}
