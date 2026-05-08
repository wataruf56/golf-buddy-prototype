import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// GET /api/admin/rounds?token=XXX[&hostId=...]
export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const url = new URL(req.url);
  const hostId = url.searchParams.get('hostId') || '';

  try {
    let q: any = db.collection('rounds');
    if (hostId) q = q.where('hostId', '==', hostId);
    const snap = await q.limit(200).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    items.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    // Resolve host displayNames
    const hostIds = Array.from(new Set(items.map((r: any) => r.hostId).filter(Boolean)));
    const users: Record<string, any> = {};
    await Promise.all(hostIds.map(async (uid) => {
      const us = await db.collection('users').doc(uid as string).get();
      users[uid as string] = us.exists ? { displayName: us.data().displayName || '', avatar: us.data().avatar || '⛳' } : { displayName: '(deleted)', avatar: '?' };
    }));

    return NextResponse.json({ count: items.length, items, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// DELETE /api/admin/rounds?token=XXX  body: { id, cascade?: boolean }
// cascade=true → also deletes related pendingReviews + roundChats
export async function DELETE(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const id = String(body?.id || '').trim();
  const cascade = !!body?.cascade;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: noStore });

  try {
    const doc = await db.collection('rounds').doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    await db.collection('rounds').doc(id).delete();

    let pendingDeleted = 0;
    let chatMsgsDeleted = 0;
    if (cascade) {
      // Delete pendingReviews tied to this round
      try {
        const snap = await db.collection('pendingReviews').where('roundId', '==', id).get();
        const batch = db.batch();
        snap.docs.forEach((d: any) => { batch.delete(d.ref); pendingDeleted++; });
        if (!snap.empty) await batch.commit();
      } catch {}

      // Delete round chat messages
      try {
        const msgs = await db.collection('roundChats').doc(id).collection('messages').limit(500).get();
        const batch = db.batch();
        msgs.docs.forEach((d: any) => { batch.delete(d.ref); chatMsgsDeleted++; });
        if (!msgs.empty) await batch.commit();
      } catch {}
    }

    return NextResponse.json({ ok: true, pendingDeleted, chatMsgsDeleted }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
