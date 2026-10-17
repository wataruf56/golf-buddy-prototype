import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/crush-notice?token= { userIds?: string[] } … 「💘 気になっている人がいるようです」のお知らせを、
// 20時台を待たずにいますぐ回す（確認・テスト用・2026-10-17・lib/crushNotice）。userIds を渡すとその人たちだけ。
// 月1回まで・新しい 💘 があるときだけ、の条件はふだんと同じ。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const onlyUserIds = Array.isArray(body.userIds) ? body.userIds.map(String).filter(Boolean).slice(0, 200) : undefined;
  const { sendCrushNotices } = await import('@/lib/crushNotice');
  const result = await sendCrushNotices(Date.now(), { force: true, onlyUserIds });
  return NextResponse.json(result, { headers: noStore });
}
