import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, pub } from '@/lib/snsTest';
import { getThread, sendTestDm } from '@/lib/snsTestTalk';

// GET  /api/sns/dm/[id] … テスト版のDM（相手＝テスト用の人）。開くと既読
// POST /api/sns/dm/[id] { text, story? } … 送る。テスト用の人が返事をする。既存のDM・通知・LINEには何も送らない
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
  const t = await getThread(me, pub(me), params.id);
  if (!t.other) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(t, { headers: noStore });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await meOrNull();
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  try {
    await sendTestDm(me.id, params.id, String(body?.text || ''), body?.story ? String(body.story) : undefined);
    return NextResponse.json(await getThread(me, pub(me), params.id), { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: noStore });
  }
}
