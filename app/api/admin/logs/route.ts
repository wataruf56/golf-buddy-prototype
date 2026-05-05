import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// GET /api/admin/logs?token=XXX&limit=N&userId=Uxxx
// Token must match ADMIN_LOG_TOKEN env var. Returns recent _logs entries.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10) || 100);
  const userId = url.searchParams.get('userId') || '';

  if (isDemoMode) {
    return NextResponse.json({ logs: [], note: 'demo mode' }, { headers: noStore });
  }
  const db = getAdminDb() as any;
  if (!db) {
    return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  }
  try {
    let q = db.collection('_logs') as any;
    if (userId) q = q.where('userId', '==', userId);
    const snap = await q.orderBy('ts', 'desc').limit(limit).get();
    const logs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({
      count: logs.length,
      logs,
      serverTime: new Date().toISOString(),
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({
      error: (e as Error).message,
    }, { status: 500, headers: noStore });
  }
}
