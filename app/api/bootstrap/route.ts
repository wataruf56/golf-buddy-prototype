import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isDemoMode } from '@/lib/demoMode';

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

  const [roundsRes, pendingReviewsRes, chatsRes] = await Promise.allSettled([
    db.listRounds({ status: 'open' }),
    db.listPendingReviews(meId),
    db.listChatsForUser(meId),
  ]);
  const rounds = roundsRes.status === 'fulfilled' ? roundsRes.value : [];
  const pendingReviews = pendingReviewsRes.status === 'fulfilled' ? pendingReviewsRes.value : [];
  const chats = chatsRes.status === 'fulfilled' ? chatsRes.value : [];
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

  const users = await db.listUsers(Array.from(userIds));
  // Ensure me is included even if Firestore user missing
  if (!users.find((u) => u.id === meId) && me) users.push(me);

  return NextResponse.json({ ok: true, meId, me, users, rounds, pendingReviews, chats });
}
