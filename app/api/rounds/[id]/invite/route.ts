import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { userCohort } from '@/lib/ageGate';

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
  if (!isRoundHost(existing, meId)) {
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
    if (userCohort(invitee0) !== existing.hostCohort) {
      return NextResponse.json(
        { error: 'cohort_mismatch', message: 'この募集とは別の年代のユーザーは招待できません' },
        { status: 403 },
      );
    }
  }

  // 招待の保存と通知は運営の「代わりに招待」と共通（lib/roundInvite）。招待された人が受け取るものは同じ。
  const { sendRoundInvite } = await import('@/lib/roundInvite');
  const { round } = await sendRoundInvite({ round: existing, inviteeId: userId, by: 'host', message: inviteMessage });

  return NextResponse.json({ round, invited: true });
}
