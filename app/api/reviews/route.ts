import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/auth';
import { mockReviews } from '@/lib/mockData';
import { getAdminDb } from '@/lib/firebase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (isDemoMode) {
    return NextResponse.json({
      reviews: userId ? mockReviews.filter((r) => r.revieweeId === userId) : mockReviews,
    });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ reviews: [] });
  let q: any = db.collection('reviews');
  if (userId) q = q.where('revieweeId', '==', userId);
  const snap = await q.orderBy('createdAt', 'desc').get();
  return NextResponse.json({ reviews: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (isDemoMode) {
    return NextResponse.json({ ok: true, id: `rv_${Date.now()}` });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ ok: false, error: 'no-db' }, { status: 500 });
  const ref = await db.collection('reviews').add({ ...body, createdAt: Date.now(), isAnonymous: true });
  return NextResponse.json({ ok: true, id: ref.id });
}
