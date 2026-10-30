import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { snsAllowed, buildHome } from '@/lib/snsTest';

// GET /api/sns/home … インスタ風ホームのテスト版（運営だけ・lib/snsTest）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const me = await db.getUser(meId!);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json(await buildHome(me), { headers: noStore });
}
