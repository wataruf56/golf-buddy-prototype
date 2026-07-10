import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

// POST /api/rounds/[id]/interest  body: { interested: boolean }
// Toggle the current user's ♡「気になる」on a round. When newly added, notify
// the host (gated on their "interestReceived" pref). Anyone can mark interest;
// the list of interested users is public.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned, blockedByRestriction } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const rstInterest = await blockedByRestriction(meId, 'noInterest', '「気になる」の利用が制限されています。'); if (rstInterest) return rstInterest;

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // The host marking their own round as interested makes no sense.
  if (existing.hostId === meId) {
    return NextResponse.json({ error: 'own_round' }, { status: 400 });
  }

  let interested = true;
  try {
    const body = await req.json();
    if (typeof body?.interested === 'boolean') interested = body.interested;
  } catch { /* default to true */ }

  const { round, added } = await db.setInterest(params.id, meId, interested);

  if (added) {
    const host = await db.getUser(existing.hostId);
    const me = await db.getUser(meId);
    const name = me?.displayName || 'ゲスト';
    const link = `/round/${params.id}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('interestReceived', { '名前': name, '募集タイトル': existing.title });
    const { addNotification } = await import('@/lib/notifications');
    if (n.inApp) addNotification(existing.hostId, 'interestReceived', n.inApp, link).catch(() => {});
    if (isNotifyEnabled(host as any, 'interestReceived')) {
      pushTo(existing.hostId, n.line, liffUrl(link)).catch(() => {});
      webPushText(existing.hostId, n.webTitle, n.webBody, link, `interest-${params.id}`).catch(() => {});
    }
  }

  return NextResponse.json({ round, interested });
}
