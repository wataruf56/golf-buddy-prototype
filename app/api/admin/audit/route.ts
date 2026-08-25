import { NextRequest, NextResponse } from 'next/server';
import { listAudit } from '@/lib/auditLog';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

// 操作ログ（誰が・誰に・何をしたか）を読む。
//   ?action=  … 操作の種類でしぼる
//   ?targetId=… 「この人に何をしたか」でしぼる
//   ?actorId= … 「この人が何をしたか」でしぼる
//   ?days=    … 期間（既定30日）
function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const u = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get('days') || 30)));
  const rows = await listAudit({
    limit: Math.min(500, Number(u.searchParams.get('limit') || 200)),
    action: u.searchParams.get('action') || undefined,
    targetId: u.searchParams.get('targetId') || undefined,
    actorId: u.searchParams.get('actorId') || undefined,
    since: Date.now() - days * 86400000,
  });

  // 画面のしぼり込み用に、実際に出てきた種類だけを返す。
  const actions = Array.from(new Set(rows.map((r) => r.action))).sort();
  return NextResponse.json({ rows, actions, days }, { headers: noStore });
}
