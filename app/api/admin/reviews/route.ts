import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// Recompute reviewAvg / reviewCount for a user after a review change.
async function recomputeUserStats(db: any, userId: string) {
  const snap = await db.collection('reviews').where('revieweeId', '==', userId).get();
  const reviews = snap.docs.map((d: any) => d.data());
  const count = reviews.length;
  const avg = count > 0
    ? Math.round((reviews.reduce((s: number, r: any) => s + (r.stars || 0), 0) / count) * 10) / 10
    : 0;
  await db.collection('users').doc(userId).set({ reviewAvg: avg, reviewCount: count }, { merge: true });
}

// GET /api/admin/reviews?token=XXX[&userId=...&roundId=...]
export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || '';
  const roundId = url.searchParams.get('roundId') || '';

  try {
    let q: any = db.collection('reviews');
    if (userId) q = q.where('revieweeId', '==', userId);
    else if (roundId) q = q.where('roundId', '==', roundId);
    const snap = await q.limit(200).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    items.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    // Resolve user displayNames
    const userIds = Array.from(new Set(items.flatMap((r: any) => [r.reviewerId, r.revieweeId]).filter(Boolean)));
    const users: Record<string, any> = {};
    await Promise.all(userIds.map(async (uid) => {
      const us = await db.collection('users').doc(uid as string).get();
      users[uid as string] = us.exists ? { displayName: us.data().displayName || '', avatar: us.data().avatar || '⛳' } : { displayName: '(deleted)', avatar: '?' };
    }));

    return NextResponse.json({ count: items.length, items, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// PATCH /api/admin/reviews?token=XXX  body: { id, stars?, tags?, comment? }
export async function PATCH(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const id = String(body?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: noStore });

  const patch: any = {};
  // 星評価は廃止。レビューは4択判定(verdict)＋タグ＋コメント。stars は後方互換で残すが通常は使わない。
  const VERDICTS = ['again', 'romantic', 'never', 'either'];
  if (typeof body.verdict === 'string' && VERDICTS.includes(body.verdict)) patch.verdict = body.verdict;
  if (typeof body.stars === 'number' && body.stars >= 1 && body.stars <= 5) patch.stars = Math.round(body.stars);
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
  if (typeof body.comment === 'string') patch.comment = body.comment;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'no fields' }, { status: 400, headers: noStore });

  try {
    await db.collection('reviews').doc(id).set(patch, { merge: true });
    const r = await db.collection('reviews').doc(id).get();
    if (r.exists && r.data().revieweeId) await recomputeUserStats(db, r.data().revieweeId);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// DELETE /api/admin/reviews?token=XXX  body: { id, revert?: boolean }
// revert=true → also resets the corresponding pendingReview back to status:'pending' so the reviewer can redo it.
export async function DELETE(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const id = String(body?.id || '').trim();
  const revert = !!body?.revert;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: noStore });

  try {
    const doc = await db.collection('reviews').doc(id).get();
    if (!doc.exists) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const data = doc.data();
    await db.collection('reviews').doc(id).delete();
    if (data.revieweeId) await recomputeUserStats(db, data.revieweeId);

    let revertedPending = 0;
    if (revert && data.roundId && data.reviewerId && data.revieweeId) {
      // Find any matching pendingReview and reset to 'pending'
      const snap = await db.collection('pendingReviews')
        .where('roundId', '==', data.roundId)
        .where('reviewerId', '==', data.reviewerId)
        .where('revieweeId', '==', data.revieweeId)
        .get();
      const batch = db.batch();
      snap.docs.forEach((d: any) => {
        batch.set(d.ref, { status: 'pending', completedAt: null, updatedAt: Date.now() }, { merge: true });
        revertedPending++;
      });
      // If no pending doc exists, recreate one
      if (snap.empty) {
        const ref = db.collection('pendingReviews').doc();
        batch.set(ref, {
          roundId: data.roundId,
          reviewerId: data.reviewerId,
          revieweeId: data.revieweeId,
          status: 'pending',
          createdAt: Date.now(),
        });
        revertedPending = 1;
      }
      await batch.commit();

      // このレビューに紐づく「いいね（again/romantic）」も取り消す。これをしないと
      // 差し戻し後に再レビューしても「マッチは前から成立済み」とみなされ、
      // 「マッチしました」通知が再発火しない（再レビュー＝まっさらな状態にする）。
      for (const kind of ['again', 'romantic']) {
        try { await db.collection('_matchLikes').doc(`${kind}__${data.reviewerId}__${data.revieweeId}`).delete(); } catch { /* noop */ }
      }
    }

    return NextResponse.json({ ok: true, revertedPending }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
