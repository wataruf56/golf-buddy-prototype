import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { invalidateRematchConfigCache } from '@/lib/rematchConfig';

// 管理者用：再会エンジンのテストデータ（セッション＋計測イベント）を全削除。
// テストで作った「決定済み」等のセッションをまっさらに戻して再テストするため。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

async function wipe(col: string): Promise<number> {
  const db = getAdminDb() as any;
  if (!db) return 0;
  let total = 0;
  // バッチ削除（500件ずつ）。
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(col).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d: any) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < 400) break;
  }
  return total;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  try {
    const sessions = await wipe('_rematch');
    const events = await wipe('_rematchEvents');
    invalidateRematchConfigCache();
    return NextResponse.json({ ok: true, deletedSessions: sessions, deletedEvents: events }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
