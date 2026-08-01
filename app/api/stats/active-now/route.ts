import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { getMeId } from '@/lib/session';

// GET /api/stats/active-now
// 直近1時間にログイン（アプリを開いた）ユーザー数を返す。lastActiveAt は bootstrap で
// アプリを開くたびに更新される（5分throttle）。ホーム上部の「いま何人が来ているか」表示用。
// リクエスト毎に集計する（ビルド時に固定させない）。
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const WINDOW_MS = 60 * 60 * 1000; // 1時間

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ count: 0, windowMinutes: 60 }, { headers: noStore });

  const cutoff = Date.now() - WINDOW_MS;
  try {
    // 件数集計（aggregation）。使えない環境ではdocを引いて数える。
    const q = db.collection('users').where('lastActiveAt', '>=', cutoff);
    try {
      const agg = await q.count().get();
      const count = agg.data().count || 0;
      return NextResponse.json({ count, windowMinutes: 60 }, { headers: noStore });
    } catch {
      const snap = await q.select('lastActiveAt').limit(1000).get();
      return NextResponse.json({ count: snap.size, windowMinutes: 60 }, { headers: noStore });
    }
  } catch (e) {
    return NextResponse.json({ count: 0, windowMinutes: 60, error: (e as Error).message }, { headers: noStore });
  }
}
