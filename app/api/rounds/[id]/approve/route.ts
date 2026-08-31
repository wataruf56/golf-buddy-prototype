import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { canGenderJoin, genderFullMessage } from '@/lib/roundEligibility';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  // 性別ごとの募集枠ガード：承認で枠が消費されるため、ここでも空きを確認する。
  {
    const applicant = await db.getUser(userId);
    const approved = await Promise.all((round.applicantIds || []).map((id) => db.getUser(id)));
    const approvedGenders = approved.map((u) => u?.gender);
    if (!canGenderJoin(round, approvedGenders, applicant?.gender)) {
      return NextResponse.json({ error: 'gender_full', message: genderFullMessage(applicant?.gender) }, { status: 403 });
    }
  }

  const updated = await db.approveApplicant(params.id, userId);

  // Notify the approved applicant — gated on their "applyApproved" pref.
  try {
    const applicant = await db.getUser(userId);
    const link = `/round/${params.id}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('applyApproved', { '募集タイトル': round.title });
    const { addNotification } = await import('@/lib/notifications');
    if (n.inApp) addNotification(userId, 'applyApproved', n.inApp, link).catch(() => {});
    if (isNotifyEnabled(applicant as any, 'applyApproved')) {
      pushTo(userId, n.line, liffUrl(link), 'approved').catch(() => {});
      webPushText(userId, n.webTitle, n.webBody, link, `approve-${params.id}`).catch(() => {});
    }
  } catch { /* non-fatal */ }

  // チャットへ「◯◯さんが参加しました」＋歓迎の一言。
  try {
    const { postJoinMessages } = await import('@/lib/joinWelcome');
    const joined = await db.getUser(userId);
    await postJoinMessages(round, joined, updated?.currentCount || 0, round.maxSpots || 0);
  } catch (e) {
    console.error('[approve] welcome failed (non-fatal)', e);
  }

  // 出入りのログ。「誰が」は入った本人にして、承認した主催者は by に残す。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(userId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」に入った`,
      detail: { by: 'host', hostId: meId, seats: `${updated?.currentCount ?? ''}` },
    }, req);
  } catch { /* ログの失敗で承認を止めない */ }

  return NextResponse.json({ round: updated });
}
