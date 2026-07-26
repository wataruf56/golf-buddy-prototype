import { NextRequest, NextResponse } from 'next/server';
import { runUnreadDigest } from '@/lib/unreadDigest';

// 未読メッセージのまとめ通知（実処理は lib/unreadDigest）。housekeeping から毎tick呼ばれ、
// JST 9/15/21時の最初の1回だけ、未読があるユーザーへ「未読のメッセージがあります。」を送る。
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
    const res = await runUnreadDigest();
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
