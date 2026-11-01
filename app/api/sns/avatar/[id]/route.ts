import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { db } from '@/lib/db';

// GET /api/sns/avatar/[id]?v=… … プロフィール写真（テスト版・運営だけ）。
// data:URL のままだと一覧の返事が重くなるので、写真だけここから別に読む（lib/snsTest の avatarSrc）。
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return new NextResponse('not found', { status: 404 });
  const u = await db.getUser(params.id).catch(() => null);
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(u?.avatarUrl || '');
  if (!m) return new NextResponse('not found', { status: 404 });
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=604800' } });
}
