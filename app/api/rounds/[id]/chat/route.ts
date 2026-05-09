import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushToMany, liffUrl } from '@/lib/linePush';
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
  // Notify all OTHER participants (host + approved) on LINE.
  const recipients = [round.hostId, ...(round.applicantIds || [])].filter((id) => id && id !== meId);
  if (recipients.length) {
    const me = await db.getUser(meId);
    const others = await Promise.all(recipients.map((id) => db.getUser(id)));
    const targets = others.filter((u) => u && !(u as any).notifyOff).map((u) => u!.id);
    if (targets.length) {
      const senderName = me?.displayName || '参加者';
      const preview = trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed;
      pushToMany(targets, `🏌️ ${round.title}\n${senderName}: ${preview}`, liffUrl(`/round/${params.id}/chat`)).catch(() => {});
    }
  }
  return NextResponse.json({ message }, { headers: noStore });
}
