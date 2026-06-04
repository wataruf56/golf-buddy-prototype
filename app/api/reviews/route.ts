import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// Anonymity-friendly age bucket (same as /api/users/[id]).
function ageBucket(age: number | undefined): string {
  if (typeof age !== 'number' || age <= 0) return '';
  if (age >= 40) return '40+';
  if (age >= 35) return '35-40';
  if (age >= 30) return '30-35';
  if (age >= 25) return '25-30';
  if (age >= 20) return '20-25';
  return '〜20';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return NextResponse.json({ reviews: [] });
  const reviews = await db.listReviewsForUser(userId);
  // Enrich with the reviewer's anonymised demographics (age bucket + gender),
  // exactly like /api/users/[id], so the mypage review list matches the
  // profile page. Never expose reviewerId / displayName — reviews stay anon.
  const reviewerIds = Array.from(new Set(reviews.map((r) => r.reviewerId).filter(Boolean)));
  const reviewers = await db.listUsers(reviewerIds);
  const byId: Record<string, { ageBucket: string; gender?: string }> = {};
  for (const u of reviewers) byId[u.id] = { ageBucket: ageBucket(u.age), gender: u.gender };
  const enriched = reviews.map((r) => ({
    ...r,
    reviewerId: '',
    reviewer: byId[r.reviewerId] || { ageBucket: '', gender: undefined },
  }));
  return NextResponse.json({ reviews: enriched });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const body = await req.json();
  const { pendingId, revieweeId, roundId, stars, tags, comment } = body || {};
  if (!revieweeId || !roundId || !stars) {
    return NextResponse.json({ error: 'invalid: revieweeId/roundId/stars required' }, { status: 400 });
  }
  const tagList = Array.isArray(tags) ? tags.filter((t: any) => typeof t === 'string' && t.trim()) : [];
  if (tagList.length < 1) {
    return NextResponse.json({ error: 'tags_required', message: 'タグを1つ以上選んでください' }, { status: 400 });
  }
  try {
    const review = await db.createReview({
      roundId, reviewerId: meId, revieweeId,
      stars: Number(stars), tags: tagList,
      comment: comment ? String(comment) : '',
      createdAt: Date.now(), isAnonymous: true,
    });
    if (pendingId) {
      try { await db.completePendingReview(pendingId, { roundId, reviewerId: meId, revieweeId }); }
      catch (e) { console.error('[completePendingReview] failed (non-fatal)', e); }
    } else {
      // No pendingId? Still try to mark any matching pending doc as completed.
      try { await db.completePendingReview('', { roundId, reviewerId: meId, revieweeId }); }
      catch (e) { console.error('[completePendingReview triple] failed (non-fatal)', e); }
    }

    // Notify the reviewee — anonymously (reviews are anonymous, so never
    // include the reviewer's name). Gated on their "review" pref.
    try {
      const reviewee = await db.getUser(revieweeId);
      if (isNotifyEnabled(reviewee as any, 'review')) {
        const msg = '⭐ あなたへのレビューが届きました';
        pushTo(revieweeId, msg, liffUrl(`/profile/${revieweeId}`)).catch(() => {});
        webPushText(revieweeId, 'レビューが届きました', '新しいレビューが投稿されました', `/profile/${revieweeId}`, `review-${roundId}`).catch(() => {});
      }
    } catch { /* non-fatal */ }

    return NextResponse.json({ review });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/reviews POST] failed', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
