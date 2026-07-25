import { NextRequest, NextResponse } from 'next/server';
import { runReviewFollowup } from '@/lib/reviewFollowup';

// 3日後のレビュー再リマインド（実処理は lib/reviewFollowup に集約）。
// housekeeping から毎tick呼ばれる。手動実行は ?secret= でも可。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('vercel-cron')) return true;
  const url = new URL(req.url);
  if (expected && url.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  try {
    const res = await runReviewFollowup();
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
