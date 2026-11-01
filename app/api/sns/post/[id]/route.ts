import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { deletePost } from '@/lib/snsTestPosts';

// POST /api/sns/post/[id] { action: 'delete' } … 自分の投稿を消す（テスト版・運営だけ）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'delete') return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
  const ok = await deletePost(meId!, params.id).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
}
