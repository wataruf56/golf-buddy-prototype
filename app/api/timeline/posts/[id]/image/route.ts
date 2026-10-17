import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';

// GET /api/timeline/posts/[id]/image … タイムラインの「今日の写真」の画像そのもの（2026-10-17）。
// 見られる人（同じ年代・テスト垢の投稿はテスト垢）だけ。タイムラインの一覧には URL だけを返し、画像はここから読む。
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return new NextResponse('unauthorized', { status: 401 });
  const { getPost, canSeePost } = await import('@/lib/timelinePosts');
  const post = await getPost(params.id);
  if (!post?.image) return new NextResponse('not found', { status: 404 });
  const me = await db.getUser(meId);
  if (!me || !(await canSeePost(post, me as any))) return new NextResponse('forbidden', { status: 403 });
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(post.image);
  if (!m) return new NextResponse('bad image', { status: 500 });
  const buf = Buffer.from(m[2], 'base64');
  return new NextResponse(buf, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}
