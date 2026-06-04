import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { getBuddyIds } from '@/lib/buddies';

// POST /api/rounds/[id]/invite  body: { userId }
// The host invites a past ゴル友 (mutual review) OR someone who marked the round
// as 気になる. The invited user gets a LINE notification (gated on "invited").
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '募集者のみ招待できます' }, { status: 403 });
  }

  let userId = '';
  try {
    const body = await req.json();
    userId = String(body?.userId || '').trim();
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId === meId) return NextResponse.json({ error: 'cannot_invite_self' }, { status: 400 });

  // Eligible invitees: ゴル友 (mutual review with host) OR 気になる on this round.
  const isInterested = (existing.interestedIds || []).includes(userId);
  let eligible = isInterested;
  if (!eligible) {
    const buddies = await getBuddyIds(meId);
    eligible = buddies.includes(userId);
  }
  if (!eligible) {
    return NextResponse.json(
      { error: 'not_eligible', message: '招待できるのはゴル友、または「気になる」を押した人だけです' },
      { status: 403 },
    );
  }

  const { round, added } = await db.inviteToRound(params.id, userId);

  if (added) {
    const invitee = await db.getUser(userId);
    const host = await db.getUser(meId);
    const hostName = host?.displayName || '募集者';
    const msg = `💌 ${hostName} さんから「${existing.title}」に招待が届きました`;
    const { addNotification } = await import('@/lib/notifications');
    addNotification(userId, 'invited', msg, `/round/${params.id}`).catch(() => {});
    if (isNotifyEnabled(invitee as any, 'invited')) {
      pushTo(userId, msg, liffUrl(`/round/${params.id}`)).catch(() => {});
      webPushText(userId, 'ラウンドに招待されました', msg, `/round/${params.id}`, `invite-${params.id}`).catch(() => {});
    }
  }

  return NextResponse.json({ round, invited: true });
}
