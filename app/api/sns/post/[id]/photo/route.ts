import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { postPhoto } from '@/lib/snsTestPosts';

// GET /api/sns/post/[id]/photo?i=0 … 投稿の写真（テスト版・運営だけ・snsTestPostPhotos）
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return new NextResponse('not found', { status: 404 });
  const i = Number(new URL(req.url).searchParams.get('i') || 0);
  const url = await postPhoto(params.id, i).catch(() => null);
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url || '');
  if (!m) return new NextResponse('not found', { status: 404 });
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}
