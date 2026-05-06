import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const host = await db.getUser(existing.hostId);
  if ((host?.blockedUserIds || []).includes(meId)) {
    return NextResponse.json({ error: 'blocked_by_host' }, { status: 403 });
  }
  const round = await db.joinRound(params.id, meId);
  // Notify host of new application.
  if (host && !(host as any).notifyOff) {
    const me = await db.getUser(meId);
    const applicantName = me?.displayName || 'ゲスト';
    pushTo(existing.hostId, `🆕 ${applicantName} さんが「${existing.title}」に参加申請しました`, liffUrl(`/round/${params.id}`)).catch(() => {});
  }
  return NextResponse.json({ round });
}
