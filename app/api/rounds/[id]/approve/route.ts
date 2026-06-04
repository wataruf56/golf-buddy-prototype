import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (round.hostId !== meId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const updated = await db.approveApplicant(params.id, userId);

  // Notify the approved applicant — gated on their "applyApproved" pref.
  try {
    const applicant = await db.getUser(userId);
    const msg = `✅ 「${round.title}」への参加が承認されました！`;
    const { addNotification } = await import('@/lib/notifications');
    addNotification(userId, 'applyApproved', msg, `/round/${params.id}`).catch(() => {});
    if (isNotifyEnabled(applicant as any, 'applyApproved')) {
      pushTo(userId, msg, liffUrl(`/round/${params.id}`)).catch(() => {});
      webPushText(userId, '参加が承認されました', msg, `/round/${params.id}`, `approve-${params.id}`).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ round: updated });
}
