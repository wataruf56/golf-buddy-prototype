import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理画面：ユーザーを完全削除（テストアカウントの後始末用）。
// 誤削除防止のため、呼び出し側は confirmName に「表示名」を渡し、対象ドキュメントの
// displayName と一致した時のみ実行する。best-effort で関連データもカスケード削除する。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

async function deleteQuery(adb: any, ref: any): Promise<number> {
  let n = 0;
  const snap = await ref.get();
  for (const d of snap.docs) { try { await d.ref.delete(); n++; } catch {} }
  return n;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const userId = String(body.userId || '');
  const confirmName = String(body.confirmName || '');
  if (!userId || !confirmName) return NextResponse.json({ error: 'bad_request', message: 'userId と confirmName が必要です' }, { status: 400, headers: noStore });

  const user = await db.getUser(userId);
  if (!user) return NextResponse.json({ error: 'not_found', message: 'ユーザーが見つかりません' }, { status: 404, headers: noStore });
  // 誤削除防止：渡された名前と実際の表示名が一致しなければ実行しない。
  if ((user.displayName || '') !== confirmName) {
    return NextResponse.json({ error: 'name_mismatch', message: `表示名が一致しません（実際: 「${user.displayName || ''}」）` }, { status: 409, headers: noStore });
  }

  // 取り返しのつかない操作なので、実行する前に台帳へ残す。
  await audit({
    ...(await adminActor(null)),
    action: AUDIT_ACTION.userDelete,
    targetKind: 'user', targetId: userId, targetName: user.displayName || '',
    summary: `会員「${user.displayName || userId}」を削除した`,
  }, req);

  const summary: Record<string, number> = { rounds_hosted_deleted: 0, rounds_left: 0, chats_deleted: 0, chat_messages_deleted: 0, reviews_deleted: 0, pendingReviews_deleted: 0, matchLikes_deleted: 0, reports_deleted: 0, notifications_deleted: 0, friend_refs_cleaned: 0 };

  // 1) ラウンド：主催は削除、参加していたものは自分だけ外す。
  try {
    const rounds = await db.listRounds();
    for (const r of rounds) {
      if (r.hostId === userId) {
        try { await db.deleteRound(r.id); summary.rounds_hosted_deleted++; } catch {}
        continue;
      }
      const inArrays = [r.applicantIds, r.pendingApplicantIds, r.invitedIds, r.interestedIds, r.noShowIds]
        .some((a) => Array.isArray(a) && a.includes(userId));
      const inGroups = (r.groups || []).some((g) => (g.memberIds || []).includes(userId));
      const inPrefs = !!(r.groupPrefs && r.groupPrefs[userId]);
      if (!inArrays && !inGroups && !inPrefs) continue;
      const patch: any = {
        applicantIds: (r.applicantIds || []).filter((x) => x !== userId),
        pendingApplicantIds: (r.pendingApplicantIds || []).filter((x) => x !== userId),
        invitedIds: (r.invitedIds || []).filter((x) => x !== userId),
        interestedIds: (r.interestedIds || []).filter((x) => x !== userId),
        noShowIds: (r.noShowIds || []).filter((x) => x !== userId),
      };
      if (r.groups) patch.groups = r.groups.map((g) => ({ ...g, memberIds: (g.memberIds || []).filter((x) => x !== userId) }));
      if (inPrefs) { const gp = { ...(r.groupPrefs || {}) }; delete gp[userId]; patch.groupPrefs = gp; }
      patch.currentCount = Math.max(1, 1 + (r.externalMale || 0) + (r.externalFemale || 0) + patch.applicantIds.length);
      try { await db.updateRound(r.id, patch); summary.rounds_left++; } catch {}
    }
  } catch {}

  // 2) DMチャット（participants に含まれるもの）＋メッセージ。
  try {
    const chatSnap = await adb.collection('chats').where('participants', 'array-contains', userId).get();
    for (const c of chatSnap.docs) {
      try {
        const msgs = await c.ref.collection('messages').get();
        for (const m of msgs.docs) { try { await m.ref.delete(); summary.chat_messages_deleted++; } catch {} }
        await c.ref.delete(); summary.chats_deleted++;
      } catch {}
    }
  } catch {}

  // 3) レビュー（reviewer / reviewee 両方向）。
  try {
    summary.reviews_deleted += await deleteQuery(adb, adb.collection('reviews').where('reviewerId', '==', userId));
    summary.reviews_deleted += await deleteQuery(adb, adb.collection('reviews').where('revieweeId', '==', userId));
  } catch {}
  // 4) 保留レビュー。
  try {
    summary.pendingReviews_deleted += await deleteQuery(adb, adb.collection('pendingReviews').where('reviewerId', '==', userId));
    summary.pendingReviews_deleted += await deleteQuery(adb, adb.collection('pendingReviews').where('revieweeId', '==', userId));
  } catch {}
  // 5) マッチ(_matchLikes)：docId が kind__from__to。userId を含むものを削除。
  try {
    const mlSnap = await adb.collection('_matchLikes').get();
    for (const d of mlSnap.docs) {
      if (d.id.includes(`__${userId}`) || d.id.endsWith(`__${userId}`) || String(d.data()?.from) === userId || String(d.data()?.to) === userId) {
        try { await d.ref.delete(); summary.matchLikes_deleted++; } catch {}
      }
    }
  } catch {}
  // 6) 通報（reporter / target / 旧reportedId）。
  try {
    summary.reports_deleted += await deleteQuery(adb, adb.collection('_reports').where('reporterId', '==', userId));
    summary.reports_deleted += await deleteQuery(adb, adb.collection('_reports').where('targetId', '==', userId));
    summary.reports_deleted += await deleteQuery(adb, adb.collection('_reports').where('reportedId', '==', userId));
  } catch {}
  // 7) お知らせ（users/{id}/notifications）。
  try {
    summary.notifications_deleted += await deleteQuery(adb, adb.collection('users').doc(userId).collection('notifications'));
  } catch {}
  // 8) 他ユーザーの friendIds / blockedUserIds から除去。
  try {
    for (const field of ['friendIds', 'blockedUserIds']) {
      const s = await adb.collection('users').where(field, 'array-contains', userId).get();
      for (const d of s.docs) {
        const arr = (d.data()?.[field] || []).filter((x: string) => x !== userId);
        try { await d.ref.set({ [field]: arr, updatedAt: Date.now() }, { merge: true }); summary.friend_refs_cleaned++; } catch {}
      }
    }
  } catch {}

  // 9) ユーザー本体を削除。
  let userDeleted = false;
  try { await adb.collection('users').doc(userId).delete(); userDeleted = true; } catch {}

  return NextResponse.json({ ok: userDeleted, deletedUser: { userId, name: user.displayName }, summary }, { headers: noStore });
}
