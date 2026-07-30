import { NextRequest, NextResponse } from 'next/server';
import { getLineStats, listLineStatsMonths, LINE_KIND_LABEL } from '@/lib/lineStats';

// 管理画面：LINE送信の集計（種別ごとの通数・月別推移）。来月からのLINE有料化に備え、
// 「どの内容のLINEを全体に何通送っているか」を把握するため。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const month = new URL(req.url).searchParams.get('month') || undefined;
  const [stats, months] = await Promise.all([getLineStats(month), listLineStatsMonths(6)]);
  return NextResponse.json({ stats, months, labels: LINE_KIND_LABEL }, { headers: noStore });
}
