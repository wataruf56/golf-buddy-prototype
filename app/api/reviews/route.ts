import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return NextResponse.json({ reviews: [] });
  const reviews = await db.listReviewsForUser(userId);
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { pendingId, revieweeId, roundId, stars, tags, comment } = body || {};
  if (!revieweeId || !roundId || !stars) {
    return NextResponse.json({ error: 'invalid: revieweeId/roundId/stars required' }, { status: 400 });
  }
  try {
    const review = await db.createReview({
      roundId, reviewerId: meId, revieweeId,
      stars: Number(stars), tags: Array.isArray(tags) ? tags : [],
      comment: comment ? String(comment) : '',
      createdAt: Date.now(), isAnonymous: true,
    });
    if (pendingId) {
      try { await db.completePendingReview(pendingId); }
      catch (e) { console.error('[completePendingReview] failed (non-fatal)', e); }
    }
    return NextResponse.json({ review });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/reviews POST] failed', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
