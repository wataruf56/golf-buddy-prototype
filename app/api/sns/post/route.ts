import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, buildPostOptions } from '@/lib/snsTest';
import { createPost } from '@/lib/snsTestPosts';

// GET  /api/sns/post … 投稿に付けられる自分のラウンドと、メンションできる人（テスト版・運営だけ）
// POST /api/sns/post { photos[], caption, roundId?, mentions[]? } … 写真を投稿（snsTestPosts にだけ書く・誰にも通知しない・lib/snsTestPosts）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';
const MESSAGES: Record<string, string> = {
  no_photo: '写真を選んでください', too_many: '写真は10枚までです', bad_photo: 'この写真は使えません',
  too_large: '写真が大きすぎます', bad_round: 'このラウンドは選べません',
};

async function meOf() {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return null;
  return db.getUser(meId!);
}

export async function GET() {
  const me = await meOf();
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(await buildPostOptions(me), { headers: noStore });
}

export async function POST(req: Request) {
  const me = await meOf();
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  try {
    // メンションは「メンションできる人」だけ残す
    const wanted: string[] = Array.isArray(body?.mentions) ? body.mentions.map(String) : [];
    const allowed = wanted.length ? new Set((await buildPostOptions(me)).people.map((p) => p.id)) : new Set<string>();
    const id = await createPost(me.id, body, Array.from(new Set(wanted.filter((x) => allowed.has(x)))).slice(0, 20));
    return NextResponse.json({ ok: true, id }, { headers: noStore });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m, message: MESSAGES[m] || 'うまくいきませんでした' }, { status: MESSAGES[m] ? 400 : 500, headers: noStore });
  }
}
