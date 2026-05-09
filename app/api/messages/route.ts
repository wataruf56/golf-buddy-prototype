import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return NextResponse.json({ chat: null });
  const chat = await db.getChat(chatId);
  if (!chat) return NextResponse.json({ chat: null });
  if (!chat.participants.includes(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await db.markChatRead(chatId, meId);
  return NextResponse.json({ chat });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { chatId, text, otherUserId } = body || {};
  if (!chatId || !text || !otherUserId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  // Block enforcement: either side blocking the other prevents new messages.
  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(otherUserId)]);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const meBlocksOther = (me?.blockedUserIds || []).includes(otherUserId);
  const otherBlocksMe = (other?.blockedUserIds || []).includes(meId);
  if (meBlocksOther) return NextResponse.json({ error: 'blocked_by_self' }, { status: 403 });
  if (otherBlocksMe) return NextResponse.json({ error: 'blocked_by_other' }, { status: 403 });
  const participants: [string, string] = [meId, otherUserId].sort() as [string, string];
  const message = await db.sendMessage(chatId, participants, meId, text);
  // Fire-and-forget LINE push (only if recipient hasn't disabled notifications).
  if (!(other as any)?.notifyOff) {
    const senderName = me?.displayName || 'ゴル友';
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    pushTo(otherUserId, `💬 ${senderName} さんからメッセージ\n${preview}`, liffUrl(`/chat/${chatId}?other=${meId}`)).catch(() => {});
  }
  return NextResponse.json({ message });
}
