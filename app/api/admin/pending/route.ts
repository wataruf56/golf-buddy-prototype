import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'Content-Type': 'application/json; charset=utf-8' };

// GET /api/admin/pending?token=XXX&userId=Uxxx
// Dumps all pendingReviews docs whose reviewerId == userId (any status),
// with both the actual Firestore doc id and the raw data for debugging.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const userId = url.searchParams.get('userId') || '';
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });
  if (isDemoMode) return NextResponse.json({ docs: [], note: 'demo mode' }, { headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  try {
    const snap = await db.collection('pendingReviews').where('reviewerId', '==', userId).limit(100).get();
    const docs = snap.docs.map((d: any) => ({
      docId: d.id,
      data: d.data(),
    }));
    return NextResponse.json({ count: docs.length, docs }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
