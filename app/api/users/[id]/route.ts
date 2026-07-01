import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Bucket a numeric age into the display label used on reviewer chips.
// Anonymity-friendly bucketing — 5-year windows up to 40, 40+ collapsed.
function ageBucket(age: number | undefined): string {
  if (typeof age !== 'number' || age <= 0) return '';
  if (age >= 40) return '40+';
  if (age >= 35) return '35-40';
  if (age >= 30) return '30-35';
  if (age >= 25) return '25-30';
  if (age >= 20) return '20-25';
  return '〜20';
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await db.getUser(params.id);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // 赤バン（アカウント停止）ユーザーのプロフィールは他者から見えない。
  try {
    const { isBanned } = await import('@/lib/banAccess');
    if (await isBanned(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch { /* 判定不能時は通常表示 */ }
  const reviews = await db.listReviewsForUser(params.id);

  // Recompute live stats — the stored counters can lag (roundCount only bumps
  // at completion; reviewAvg/Count occasionally drift). Show truth.
  let roundCount = user.roundCount || 0;
  try {
    const allRounds = await db.listRounds();
    const completed = allRounds.filter((r) =>
      r.status === 'completed' && (r.hostId === params.id || (r.applicantIds || []).includes(params.id))
    ).length;
    roundCount = Math.max(roundCount, completed);
  } catch { /* fall back to stored */ }
  const reviewCount = reviews.length;
  const reviewAvg = reviewCount
    ? Math.round((reviews.reduce((s, r) => s + (r.stars || 0), 0) / reviewCount) * 10) / 10
    : 0;
  // Strip the private kanji real name before returning to any viewer.
  const { realNameLast, realNameFirst, ...safe } = user;
  const publicUser = { ...safe, roundCount, reviewCount, reviewAvg };

  // Enrich reviews with the reviewer's anonymised demographics (age bucket
  // + gender). Never include displayName / userId — reviews stay anonymous
  // to the reviewee. Done server-side so the client can't pry into reviewer
  // identities.
  const reviewerIds = Array.from(new Set(reviews.map((r) => r.reviewerId).filter(Boolean)));
  const reviewers = await db.listUsers(reviewerIds);
  const byId: Record<string, { ageBucket: string; gender?: string }> = {};
  for (const u of reviewers) {
    byId[u.id] = {
      ageBucket: ageBucket(u.age),
      gender: u.gender,
    };
  }
  const enriched = reviews.map((r) => ({
    ...r,
    // Strip the reviewer id from the client payload — keep `reviewer` only.
    reviewerId: '',
    reviewer: byId[r.reviewerId] || { ageBucket: '', gender: undefined },
  }));

  return NextResponse.json({ user: publicUser, reviews: enriched });
}
