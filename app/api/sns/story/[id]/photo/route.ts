import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { storyPhoto } from '@/lib/snsTestTalk';

// GET /api/sns/story/[id]/photo … ひとことの背景の写真（テスト版・運営だけ・snsTestStoryPhotos）
export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return new NextResponse('not found', { status: 404 });
  const url = await storyPhoto(params.id).catch(() => null);
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url || '');
  if (!m) return new NextResponse('not found', { status: 404 });
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}
