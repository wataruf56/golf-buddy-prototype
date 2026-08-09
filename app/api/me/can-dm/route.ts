import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { canDm, DM_POLICY_MSG } from '@/lib/dmPolicy';

// GET /api/me/can-dm?userId=..&chatId=..
// 自分が userId にDMを送れるか（lib/dmPolicy の一元判定）。プロフィールのDMボタンや
// チャット画面の入力欄の出し分けに使う。chatId を渡すと「相手から受信済みなら返信可」も考慮。
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  const chatId = url.searchParams.get('chatId') || '';
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  const allowed = await canDm(meId, userId, chatId || undefined);
  return NextResponse.json({ allowed, message: allowed ? '' : DM_POLICY_MSG }, { headers: noStore });
}
