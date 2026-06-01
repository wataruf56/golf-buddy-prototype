import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isDemoMode } from '@/lib/demoMode';
import { getCohort } from '@/lib/ageGate';
import { isAdminUserId } from '@/lib/adminAccess';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // Auto-create user if missing (covers cases where signIn callback didn't run, e.g. demo mode)
  let me = await db.getUser(meId);
  if (!me) {
    me = await db.upsertUser({
      id: meId,
      displayName: isDemoMode ? 'Wataru' : 'ゴルファー',
      avatar: '⛳', color: '#2D8C4E',
      age: 0, area: '', scoreRange: '', playStyle: '', frequency: '',
      reviewAvg: 0, reviewCount: 0, roundCount: 0, buddyCount: 0,
    });
  }

  const [roundsRes, pendingReviewsRes, chatsRes, byMeRes, ofMeRes] = await Promise.allSettled([
    db.listRounds(),
    db.listPendingReviews(meId),
    db.listChatsForUser(meId),
    db.listReviewsByUser(meId),
    db.listReviewsForUser(meId),
  ]);
  let rounds = roundsRes.status === 'fulfilled' ? roundsRes.value : [];
  // Cohort isolation: only show rounds whose hostCohort matches the user's cohort.
  // Rounds without hostCohort are treated as orphan/legacy and hidden.
  const myCohort = getCohort(me?.age);
  if (myCohort) {
    rounds = rounds.filter((r) => r.hostCohort === myCohort);
  } else {
    rounds = [];
  }
  // Derive official status server-side (works for legacy rounds too).
  for (const r of rounds) r.isOfficial = isAdminUserId(r.hostId);
  const pendingReviews = pendingReviewsRes.status === 'fulfilled' ? pendingReviewsRes.value : [];
  const chats = chatsRes.status === 'fulfilled' ? chatsRes.value : [];
  const reviewsByMe = byMeRes.status === 'fulfilled' ? byMeRes.value : [];
  const reviewsOfMe = ofMeRes.status === 'fulfilled' ? ofMeRes.value : [];

  // Buddies = mutual review (I reviewed them AND they reviewed me).
  const reviewedByMe = new Set(reviewsByMe.map((r) => r.revieweeId));
  const reviewedMe = new Set(reviewsOfMe.map((r) => r.reviewerId));
  const buddyIds = Array.from(reviewedByMe).filter((id) => reviewedMe.has(id));

  if (roundsRes.status === 'rejected') console.error('[bootstrap] rounds failed:', roundsRes.reason);
  if (pendingReviewsRes.status === 'rejected') console.error('[bootstrap] pendingReviews failed:', pendingReviewsRes.reason);
  if (chatsRes.status === 'rejected') console.error('[bootstrap] chats failed:', chatsRes.reason);

  // Collect user IDs we need: hosts of rounds, applicants, chat participants, pending review targets
  const userIds = new Set<string>([meId]);
  for (const r of rounds) {
    userIds.add(r.hostId);
    for (const a of r.applicantIds || []) userIds.add(a);
    for (const a of r.pendingApplicantIds || []) userIds.add(a);
  }
  for (const c of chats) for (const p of c.participants) userIds.add(p);
  for (const p of pendingReviews) userIds.add(p.revieweeId);
  for (const id of buddyIds) userIds.add(id);

  const users = await db.listUsers(Array.from(userIds));
  // Ensure me is included even if Firestore user missing
  if (!users.find((u) => u.id === meId) && me) users.push(me);

  // For each round I'm a participant in, find the latest message timestamp in
  // its group chat so the client can compare against per-user lastSeen
  // (stored in localStorage) for unread badges.
  const myRounds = rounds.filter((r) => r.hostId === meId || (r.applicantIds || []).includes(meId));
  const roundChatActivity: Record<string, number> = {};
  await Promise.all(myRounds.map(async (r) => {
    try {
      const msgs = await db.listRoundMessages(r.id);
      if (msgs.length) roundChatActivity[r.id] = Math.max(...msgs.map((m) => m.createdAt));
    } catch {}
  }));

  return NextResponse.json({
    ok: true, meId, me, users, rounds, pendingReviews, chats, buddyIds, roundChatActivity,
  });
}
