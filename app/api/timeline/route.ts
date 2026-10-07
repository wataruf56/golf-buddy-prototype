import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { buildTimeline } from '@/lib/timeline';

// GET /api/timeline … タイムライン（lib/timeline）。ログイン中の会員だけ。通知は一切しない。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  try {
    const items = await buildTimeline(me);
    return NextResponse.json({ items }, { headers: noStore });
  } catch (e) {
    console.error('[timeline] failed', (e as Error).message);
    return NextResponse.json({ items: [] }, { headers: noStore });
  }
}
