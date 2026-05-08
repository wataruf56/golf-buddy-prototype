import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { listSwingAllowed } from '@/lib/swingAccess';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/admin/users?token=XXX
// Returns all users (LINE login records), sorted by createdAt desc.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const allowedSet = new Set(await listSwingAllowed());

  try {
    const snap = await db.collection('users').limit(500).get();
    const users = snap.docs.map((d: any) => {
      const u = d.data();
      return {
        id: u.id || d.id,
        displayName: u.displayName || '',
        age: u.age || null,
        gender: u.gender || null,
        car: u.car || null,
        area: u.area || null,
        scoreRange: u.scoreRange || null,
        avatarUrl: !!u.avatarUrl,
        avatarEmoji: u.avatar || null,
        lineId: u.lineId || null,
        reviewAvg: u.reviewAvg || 0,
        reviewCount: u.reviewCount || 0,
        roundCount: u.roundCount || 0,
        createdAt: u.createdAt || null,
        notifyOff: !!u.notifyOff,
        swingAllowed: allowedSet.has(u.id || d.id),
      };
    });
    // Sort: swingAllowed first, then real name first, then by id
    users.sort((a: any, b: any) => {
      if (a.swingAllowed !== b.swingAllowed) return a.swingAllowed ? -1 : 1;
      const aReal = a.displayName && a.displayName !== 'ゴルファー' ? 1 : 0;
      const bReal = b.displayName && b.displayName !== 'ゴルファー' ? 1 : 0;
      if (aReal !== bReal) return bReal - aReal;
      return (a.id || '').localeCompare(b.id || '');
    });
    return NextResponse.json({ count: users.length, users, allowedCount: allowedSet.size }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
