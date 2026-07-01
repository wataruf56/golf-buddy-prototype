import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isDemoMode } from '@/lib/demoMode';
import { getCohort } from '@/lib/ageGate';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // Auto-create user if missing (covers cases where signIn callback didn't run, e.g. demo mode)
  let me = await db.getUser(meId);
  if (!me) {
    me = await db.upsertUser({
      id: meId,
      displayName: isDemoMode ? 'Wataru' : 'ゴルファー',
      avatar: '⛳', color: '#2A8C82',
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
  // isOfficial is now an explicit stored flag (admin-toggled per round), so we
  // pass it through as-is — no read-time derivation.
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

  // 赤バン（アカウント停止）ユーザーは他ユーザーから完全に見えないよう、
  // クライアントに渡す users から除外する（自分自身は除外しない）。これにより
  // 招待候補・ゴル友・気になる一覧・参加者名など全ての表示から消える。
  let visibleUsers = users;
  try {
    const { getBannedIdSet } = await import('@/lib/banAccess');
    const bset = await getBannedIdSet();
    if (bset.size) visibleUsers = users.filter((u) => u.id === meId || !bset.has(u.id));
  } catch { /* 判定不能時はそのまま */ }

  // Strip private real names from everyone but the current user before sending.
  const { stripPrivateMany } = await import('@/lib/sanitizeUser');
  const safeUsers = stripPrivateMany(visibleUsers, meId);

  // 赤バン状態（コミュニティ機能のUIゲート用）。
  let banned = false;
  try { const { isBanned } = await import('@/lib/banAccess'); banned = await isBanned(meId); } catch {}

  // 管理者（ゴルトモ公式アカウント）判定。投稿時に「公式 / 個人」を選べる
  // UIを出すかどうかのフラグ。サーバー側でも投稿時に再検証する。
  let isAdmin = false;
  try { const { isAdminUserId } = await import('@/lib/adminAccess'); isAdmin = isAdminUserId(meId); } catch {}

  // アプリ内「お知らせ」(プッシュ通知と同じ内容を必ずホームにも表示する)。
  let notifications: any[] = [];
  try { const { listNotifications } = await import('@/lib/notifications'); notifications = await listNotifications(meId, 30); } catch {}

  return NextResponse.json({
    ok: true, meId, me, users: safeUsers, rounds, pendingReviews, chats, buddyIds, roundChatActivity, banned, isAdmin, notifications,
  });
}
