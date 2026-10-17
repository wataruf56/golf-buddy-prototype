import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db } from '@/lib/db';

// POST /api/timeline/posts/[id]/react { key } … タイムラインの投稿にいいね・リアクション（押すたびに付ける／外す）（2026-10-17）。
// key は lib/chatReactions の7種類（like=👍いいね ほか）。1人が複数の種類を付けられる。
// 返すのは数と自分の分だけ（だれが押したかは返さない）。通知はしない。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const key = String(body.key || '');
  const { REACTION_KEYS } = await import('@/lib/chatReactions');
  if (!REACTION_KEYS.includes(key)) return NextResponse.json({ error: 'bad_key' }, { status: 400, headers: noStore });
  const { getPost, canSeePost, reactionView, POSTS } = await import('@/lib/timelinePosts');
  const post = await getPost(params.id);
  if (!post) return NextResponse.json({ error: 'not_found', message: 'この投稿は見つかりません' }, { status: 404, headers: noStore });
  const me = await db.getUser(meId);
  if (!me || !(await canSeePost(post, me as any))) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const ref = adb.collection(POSTS).doc(params.id);
  const reactions = await adb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const cur: Record<string, string[]> = { ...((snap.data() || {}).reactions || {}) };
    const list = cur[key] || [];
    cur[key] = list.includes(meId) ? list.filter((x) => x !== meId) : [...list, meId];
    if (!cur[key].length) delete cur[key];
    tx.update(ref, { reactions: cur });
    return cur;
  });
  return NextResponse.json({ ok: true, ...reactionView(reactions, meId) }, { headers: noStore });
}
