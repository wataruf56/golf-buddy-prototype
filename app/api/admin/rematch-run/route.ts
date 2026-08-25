import { NextRequest, NextResponse } from 'next/server';
import { runRematchNotifier } from '@/app/api/cron/rematch-notifier/route';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理者用：再会通知バッチを今すぐ実行（テスト用）。intervalDays=0 なら完了済み
// ラウンドの相互マッチ済みペアへ即通知される。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  try {
    const res = await runRematchNotifier();
    await audit({
      ...(await adminActor(null)),
      action: AUDIT_ACTION.rematchRun, targetKind: 'broadcast',
      summary: `再会エンジンを手で実行した（${res.sent}人へ送信 / ${res.pairs}ペア）`,
      detail: res as any,
    }, req);
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
