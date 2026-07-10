import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
  if (round.hostId !== meId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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
      pushTo(userId, n.line, liffUrl(link)).catch(() => {});
      webPushText(userId, n.webTitle, n.webBody, link, `approve-${params.id}`).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ round: updated });
}
