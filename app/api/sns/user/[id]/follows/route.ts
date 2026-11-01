import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, buildFollows } from '@/lib/snsTest';

// GET /api/sns/user/[id]/follows … その人の 共通／フォロワー／フォロー中 の一覧（テスト版・運営だけ・lib/snsTest）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const me = await db.getUser(meId!);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const f = await buildFollows(me, params.id === 'me' ? me.id : params.id);
  if (!f) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(f, { headers: noStore });
}
