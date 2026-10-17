import { NextRequest, NextResponse } from 'next/server';

// POST /api/admin/crush-notice?token= { userIds?: string[] } … 「💘 気になっている人がいるようです」のお知らせを、
// 20時台を待たずにいますぐ回す（確認・テスト用・2026-10-17・lib/crushNotice）。userIds を渡すとその人たちだけ。
// 月1回まで・新しい 💘 があるときだけ、の条件はふだんと同じ。
//   { backfillTimeline: true } … 過去30日の 💘 を付けた時刻でタイムラインに載せる（このときお知らせのタイムライン行は重ねない）
//   { testUserId }             … その人に、お知らせの文面だけを試しに送る（記録・タイムラインには残さない）
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
  const { sendCrushNotices, backfillCrushTimeline, sendCrushTest } = await import('@/lib/crushNotice');
  if (body.testUserId) return NextResponse.json(await sendCrushTest(String(body.testUserId)), { headers: noStore });
  const backfill = body.backfillTimeline ? await backfillCrushTimeline() : undefined;
  const result = await sendCrushNotices(Date.now(), { force: true, onlyUserIds, noTimeline: !!body.backfillTimeline });
  return NextResponse.json({ ...result, ...(backfill ? { backfill } : {}) }, { headers: noStore });
}
