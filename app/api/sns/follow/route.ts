import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed, setFollow } from '@/lib/snsTest';

// POST /api/sns/follow { userId, on } … テスト版のフォロー／解除（snsTestFollows にだけ書く。既存の友達には触れない）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const userId = String(body?.userId || '');
  if (!userId || userId === meId) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  await setFollow(meId!, userId, !!body?.on);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
