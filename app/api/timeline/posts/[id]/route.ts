import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// DELETE /api/timeline/posts/[id] … 自分の「今日の写真」の投稿を消す（運営は誰のでも消せる）（2026-10-17）。
// アルバムに入った写真はそのまま（アルバム側で消せる）。
const noStore = { 'Cache-Control': 'no-store' };

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { getPost, POSTS } = await import('@/lib/timelinePosts');
  const post = await getPost(params.id);
  if (!post) return NextResponse.json({ ok: true }, { headers: noStore });
  const { isAdminUserId } = await import('@/lib/adminAccess');
  if (post.userId !== meId && !isAdminUserId(meId)) return NextResponse.json({ error: 'forbidden', message: '自分の投稿だけ消せます' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (adb) await adb.collection(POSTS).doc(params.id).delete();
  return NextResponse.json({ ok: true }, { headers: noStore });
}
