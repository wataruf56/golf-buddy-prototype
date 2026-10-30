import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, buildProfile } from '@/lib/snsTest';

// GET /api/sns/user/[id] … インスタ風プロフィールのテスト版（運営だけ・lib/snsTest）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const me = await db.getUser(meId!);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const p = await buildProfile(me, params.id === 'me' ? me.id : params.id);
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(p, { headers: noStore });
}
