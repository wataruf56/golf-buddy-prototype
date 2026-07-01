import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// POST /api/rounds/[id]/invite  body: { userId }
// The host invites a past ゴル友 (mutual review) OR someone who marked the round
// as 気になる. The invited user gets a LINE notification (gated on "invited").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  // 部分制限：ゴルトモ招待の停止。
  try {
    const { getRestriction } = await import('@/lib/banAccess');
    if ((await getRestriction(meId)).noInvite) {
      return NextResponse.json({ error: 'restricted', message: 'ゴルトモ招待の利用が制限されています。' }, { status: 403 });
    }
  } catch { /* 判定不能時は許可 */ }

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '募集者のみ招待できます' }, { status: 403 });
  }

  let userId = '';
  let inviteMessage = '';
  try {
    const body = await req.json();
    userId = String(body?.userId || '').trim();
    inviteMessage = String(body?.message || '').trim().slice(0, 200);
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === meId) return NextResponse.json({ error: 'cannot_invite_self' }, { status: 400 });

  // 招待対象は「登録している全ユーザー」。ただしラウンドは年代(コホート)で
  // 分離されているため、同じ年代のユーザーのみ招待できる。
  const invitee0 = await db.getUser(userId);
  if (!invitee0) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  if (existing.hostCohort) {
    const { getCohort } = await import('@/lib/ageGate');
    if (getCohort(invitee0.age) !== existing.hostCohort) {
      return NextResponse.json(
        { error: 'cohort_mismatch', message: 'この募集とは別の年代のユーザーは招待できません' },
        { status: 403 },
      );
    }
  }

  const { round, added } = await db.inviteToRound(params.id, userId);

  if (added) {
    const invitee = await db.getUser(userId);
    const host = await db.getUser(meId);
    const hostName = host?.displayName || '募集者';
    const baseMsg = `💌 ${hostName} さんから「${existing.title}」に招待が届きました`;
    const msg = inviteMessage ? `${baseMsg}\n「${inviteMessage}」` : baseMsg;
    const { addNotification } = await import('@/lib/notifications');
    addNotification(userId, 'invited', msg, `/round/${params.id}`).catch(() => {});
    if (isNotifyEnabled(invitee as any, 'invited')) {
      pushTo(userId, msg, liffUrl(`/round/${params.id}`)).catch(() => {});
      webPushText(userId, 'ラウンドに招待されました', msg, `/round/${params.id}`, `invite-${params.id}`).catch(() => {});
    }
  }

  return NextResponse.json({ round, invited: true });
}
