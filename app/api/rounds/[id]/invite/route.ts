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

  // 招待時の一言メッセージをラウンドに保存（招待された本人がラウンドを開いたときに
  // 通知だけでなく画面内でも見られるように）。空なら以前の値を保持。
  if (inviteMessage) {
    const nextMsgs = { ...(existing.inviteMessages || {}), [userId]: inviteMessage };
    await db.updateRound(params.id, { inviteMessages: nextMsgs } as any);
    (round as any).inviteMessages = nextMsgs;
  }

  if (added) {
    const invitee = await db.getUser(userId);
    const host = await db.getUser(meId);
    const hostName = host?.displayName || '募集者';
    const link = `/round/${params.id}`;
    const vars = { '主催者名': hostName, '募集タイトル': existing.title, 'ひとこと': inviteMessage ? `\n「${inviteMessage}」` : '' };
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('invited', vars);
    const { addNotification } = await import('@/lib/notifications');
    if (n.inApp) addNotification(userId, 'invited', n.inApp, link).catch(() => {});
    if (isNotifyEnabled(invitee as any, 'invited')) {
      pushTo(userId, n.line, liffUrl(link)).catch(() => {});
      webPushText(userId, n.webTitle, n.webBody, link, `invite-${params.id}`).catch(() => {});
    }
  }

  return NextResponse.json({ round, invited: true });
}
