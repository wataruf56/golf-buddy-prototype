import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushToMany, liffUrl } from '@/lib/linePush';
import { webPushToMany } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// GET /api/rounds/[id]/chat — group chat for approved participants
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const messages = await db.listRoundMessages(params.id);
  return NextResponse.json({ messages, round }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403, headers: noStore });
  }
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const { text } = await req.json();
  if (!text || !String(text).trim()) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });
  const trimmed = String(text).trim();
  const message = await db.addRoundMessage(params.id, meId, trimmed);
  // Notify other participants. A user mentioned via "@名前" gets a mention
  // notification (gated on their "mention" pref); everyone else gets the
  // general round-chat notification (gated on "roundChat", off by default).
  const recipients = [round.hostId, ...(round.applicantIds || [])].filter((id) => id && id !== meId);
  if (recipients.length) {
    const me = await db.getUser(meId);
    const senderName = me?.displayName || '参加者';
    const preview = trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
    const others = (await Promise.all(recipients.map((id) => db.getUser(id)))).filter(Boolean) as any[];

    // A recipient is "mentioned" if their display name appears after an @.
    const mentioned: any[] = [];
    const rest: any[] = [];
    for (const u of others) {
      const name = (u.displayName || '').trim();
      const isMentioned = name && (trimmed.includes('@' + name) || trimmed.includes('＠' + name));
      (isMentioned ? mentioned : rest).push(u);
    }

    const mentionTargets = mentioned.filter((u) => isNotifyEnabled(u, 'mention')).map((u) => u.id);
    if (mentionTargets.length) {
      pushToMany(mentionTargets, `📣 ${round.title}\n${senderName} さんがあなたをメンションしました\n${preview}`, liffUrl(`/round/${params.id}/chat`)).catch(() => {});
      webPushToMany(mentionTargets, `📣 ${senderName} さんからメンション`, preview, `/round/${params.id}/chat`, `mention-${params.id}`).catch(() => {});
    }

    // Everyone else (not mentioned) → general round-chat pref.
    const chatTargets = rest.filter((u) => isNotifyEnabled(u, 'roundChat')).map((u) => u.id);
    if (chatTargets.length) {
      pushToMany(chatTargets, `🏌️ ${round.title}\n${senderName}: ${preview}`, liffUrl(`/round/${params.id}/chat`)).catch(() => {});
      webPushToMany(chatTargets, `🏌️ ${round.title}`, `${senderName}: ${preview}`, `/round/${params.id}/chat`, `roundchat-${params.id}`).catch(() => {});
    }
  }
  return NextResponse.json({ message }, { headers: noStore });
}
