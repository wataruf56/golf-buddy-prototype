import 'server-only';
import { db } from './db';

// "ゴル友" = mutual review: I reviewed them AND they reviewed me (which implies
// we rounded together). Same definition used client-side in /api/bootstrap.
// Returns the set of userIds who are buddies with `userId`.
export async function getBuddyIds(userId: string): Promise<string[]> {
  const [byMe, ofMe] = await Promise.all([
    db.listReviewsByUser(userId),
    db.listReviewsForUser(userId),
  ]);
  const reviewedByMe = new Set(byMe.map((r) => r.revieweeId));
  const reviewedMe = new Set(ofMe.map((r) => r.reviewerId));
  return Array.from(reviewedByMe).filter((id) => reviewedMe.has(id));
}

export async function isBuddyOf(userId: string, candidateId: string): Promise<boolean> {
  const ids = await getBuddyIds(userId);
  return ids.includes(candidateId);
}
