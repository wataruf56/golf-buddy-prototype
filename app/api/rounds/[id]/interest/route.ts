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
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

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
    if (isNotifyEnabled(host as any, 'interestReceived')) {
      const me = await db.getUser(meId);
      const name = me?.displayName || 'ゲスト';
      const msg = `💚 ${name} さんが「${existing.title}」を気になるに追加しました`;
      pushTo(existing.hostId, msg, liffUrl(`/round/${params.id}`)).catch(() => {});
      webPushText(existing.hostId, '「気になる」が押されました', msg, `/round/${params.id}`, `interest-${params.id}`).catch(() => {});
    }
  }

  return NextResponse.json({ round, interested });
}
