import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { buildPostOptions, pub, snsAllowed } from '@/lib/snsTest';
import { deletePost, getOwnPost, removeTag, setArchived, setTagApproval, updatePost } from '@/lib/snsTestPosts';

// GET  /api/sns/post/[id] … 自分の投稿の中身（編集の画面用・テスト版・運営だけ）
// POST /api/sns/post/[id] { action: 'delete' } … 自分の投稿を消す（テスト版・運営だけ）
//                         { action: 'edit', caption, roundId, mentions[] } … 自分の投稿の文章・タグ・ラウンドを直す（通知はしない）
//                         { action: 'archive', on } … 自分の投稿を非表示にする／戻す
//                         { action: 'untag' } … 自分へのタグを外す
//                         { action: 'tag', on } … タグ付けされた投稿を自分のプロフィールに出す／出さない（通知はしない）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const post = await getOwnPost(meId!, params.id).catch(() => null);
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const users = await Promise.all(post.mentions.map((id) => db.getUser(id).catch(() => null)));
  return NextResponse.json({ caption: post.caption, roundId: post.roundId, photos: post.photos, videos: post.videos, mentions: users.filter(Boolean).map((u) => pub(u!)) }, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  if (body?.action === 'tag') {
    const done = await setTagApproval(meId!, params.id, !!body.on).catch(() => false);
    return NextResponse.json({ ok: done }, { status: done ? 200 : 404, headers: noStore });
  }
  if (body?.action === 'edit') {
    const me = await db.getUser(meId!);
    const post = me ? await getOwnPost(me.id, params.id).catch(() => null) : null;
    if (!me || !post) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    // タグは「メンションできる人」と、もともとタグ付けしていた人だけ残す
    const wanted: string[] = Array.isArray(body?.mentions) ? body.mentions.map(String) : [];
    const allowed = new Set([...post.mentions, ...(wanted.length ? (await buildPostOptions(me)).people.map((p) => p.id) : [])]);
    try {
      const done = await updatePost(me.id, params.id, body, Array.from(new Set(wanted.filter((x) => allowed.has(x)))).slice(0, 20));
      return NextResponse.json({ ok: done }, { status: done ? 200 : 404, headers: noStore });
    } catch (e) {
      const bad = (e as Error).message === 'bad_round';
      return NextResponse.json({ error: 'bad', message: bad ? 'このラウンドは選べません' : 'うまくいきませんでした' }, { status: bad ? 400 : 500, headers: noStore });
    }
  }
  if (body?.action === 'archive') {
    const done = await setArchived(meId!, params.id, !!body.on).catch(() => false);
    return NextResponse.json({ ok: done }, { status: done ? 200 : 404, headers: noStore });
  }
  if (body?.action === 'untag') {
    const done = await removeTag(meId!, params.id).catch(() => false);
    return NextResponse.json({ ok: done }, { status: done ? 200 : 404, headers: noStore });
  }
  if (body?.action !== 'delete') return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: noStore });
  const ok = await deletePost(meId!, params.id).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: noStore });
}
