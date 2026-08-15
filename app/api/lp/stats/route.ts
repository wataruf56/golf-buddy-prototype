import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { computeLpStats } from '@/lib/lpStats';

// LPに載せる実績数値。LP本体（app/lp/page.tsx）と同じ計算を共有する。
// LP側で数字が出ないときの切り分け用に、失敗理由も返す。
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ ok: false, reason: 'no_admin_db' }, { headers });
  try {
    const stats = await computeLpStats(db);
    return NextResponse.json({ ok: true, stats }, { headers });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: (e as Error).message }, { headers });
  }
}
