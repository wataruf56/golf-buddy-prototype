import { NextRequest, NextResponse } from 'next/server';
import { runReviewBlast } from '@/lib/reviewFollowup';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理者用：いま未対応(pending)のレビューがある全ユーザーへ、レビュー依頼を今すぐ1回送る。
// ボタンから手動で1回だけ叩く運用（スケジュールなし）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  try {
    const res = await runReviewBlast();
    await audit({
      ...(await adminActor(null)),
      action: AUDIT_ACTION.reviewBlast, targetKind: 'broadcast',
      summary: 'レビュー依頼の一斉送信を実行した',
      detail: res as any,
    }, req);
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
