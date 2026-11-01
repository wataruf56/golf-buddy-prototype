import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, pub } from '@/lib/snsTest';
import { storyDetail, simulateReactions, deleteStory, markViewed, answerStory } from '@/lib/snsTestTalk';

// GET  /api/sns/story/[id] … 自分のひとことの反応（見た人・答え）
// POST /api/sns/story/[id] { action: 'answer', c } | { action: 'view' } | { action: 'simulate' } | { action: 'delete' }
// テスト版・運営だけ（lib/snsTestTalk）。書くのは snsTestStories / snsTestThreads だけ。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

async function meOrNull() {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return null;
  return db.getUser(meId!);
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const me = await meOrNull();
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const d = await storyDetail(me, pub(me), params.id);
  if (!d) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(d, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await meOrNull();
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  try {
    switch (body?.action) {
      case 'answer': return NextResponse.json({ ok: true, ...(await answerStory(me, params.id, Number(body.c))) }, { headers: noStore });
      case 'view': await markViewed(me.id, params.id); return NextResponse.json({ ok: true }, { headers: noStore });
      case 'simulate': return NextResponse.json({ ok: true, added: await simulateReactions(me.id, params.id) }, { headers: noStore });
      case 'delete': await deleteStory(me.id, params.id); return NextResponse.json({ ok: true }, { headers: noStore });
      default: return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
    }
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m }, { status: m === 'not_found' ? 404 : 400, headers: noStore });
  }
}
