import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/auth';
import { mockRounds } from '@/lib/mockData';
import { getAdminDb } from '@/lib/firebase';

export async function GET() {
  if (isDemoMode) {
    return NextResponse.json({ rounds: mockRounds });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ rounds: [] });
  const snap = await db.collection('rounds').where('status', '==', 'open').orderBy('createdAt', 'desc').get();
  return NextResponse.json({ rounds: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (isDemoMode) {
    return NextResponse.json({ ok: true, round: { id: `r_${Date.now()}`, ...body } });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ ok: false, error: 'no-db' }, { status: 500 });
  const ref = await db.collection('rounds').add({ ...body, createdAt: Date.now() });
  return NextResponse.json({ ok: true, id: ref.id });
}
