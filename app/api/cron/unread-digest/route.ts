import { NextRequest, NextResponse } from 'next/server';
import { runUnreadDigest } from '@/lib/unreadDigest';

// 未読メッセージのまとめ通知（実処理は lib/unreadDigest）。housekeeping から毎tick(15分毎)呼ばれ、
// 「新しい未読があり、かつ delayMinutes 分以上未読の人」へ1通だけ送る（重複防止＝一度通知した
// 未読は再通知しない。追いメッセージ／別の人からの新規で再通知）。設定は管理画面 /admin/unread。
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
