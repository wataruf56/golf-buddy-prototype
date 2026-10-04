import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// 「行ける日」の使い方ポップアップを最後まで見た、の記録。
// 本人のユーザー行に availIntroSeenAt を置く（別の端末でも出し直さないため）。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  await db.upsertUser({ ...me, availIntroSeenAt: Date.now() } as any);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
