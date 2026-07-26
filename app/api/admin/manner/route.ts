import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：運営が事実確認のうえ、対象ユーザーのマナー/信頼度を下げる（＝mannerPenaltyを加算）。
// delta=+1 で「評価を下げる」、delta=-1 で「戻す」。0未満にはしない。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const userId = String(body.userId || '');
  const delta = Number(body.delta);
  if (!userId || (delta !== 1 && delta !== -1)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });

  const user = await db.getUser(userId);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const current = Number((user as any).mannerPenalty || 0);
  const next = Math.max(0, current + delta);
  try {
    await db.upsertUser({ id: userId, mannerPenalty: next } as any);
    return NextResponse.json({ ok: true, mannerPenalty: next }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
