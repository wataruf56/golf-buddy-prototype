import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { listThreads } from '@/lib/snsTestTalk';

// GET /api/sns/dm … テスト版だけのDMの一覧（snsTestThreads・相手はテスト用の人）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ threads: await listThreads(meId!) }, { headers: noStore });
}
