import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';

// 「行ける日」の使い方ポップアップの「見た」記録を外す（運営用）。
//   POST /api/admin/avail-intro-reset?token=XXX  body: { userIds?: string[] }
//   userIds を省略すると 20〜39歳の一般会員全員（test_ を除く）。
// 2026-10-04：ボタンが隠れる不具合の応急処置で全員に「見た」を入れたあと、
// 直した案内をあらためて1回出すために使う。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  let ids: string[] = Array.isArray(body.userIds) ? body.userIds.filter((x: unknown) => typeof x === 'string') : [];
  if (!ids.length) {
    const adb = getAdminDb() as any;
    if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
    const snap = await adb.collection('users').limit(1000).get();
    ids = snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
      .filter((u: any) => Number(u.age) >= 20 && Number(u.age) <= 39 && !String(u.id).startsWith('test_'))
      .map((u: any) => u.id);
  }
  let n = 0;
  for (const id of ids) {
    // 0 なら「まだ見ていない」扱い（GET /api/availability は !!availIntroSeenAt で判定）
    await db.updateUser(id, { availIntroSeenAt: 0 } as any);
    n += 1;
  }
  return NextResponse.json({ ok: true, reset: n }, { headers: noStore });
}
