import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

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
  const participants: [string, string] = [meId, otherUserId].sort() as [string, string];
  const message = await db.sendMessage(chatId, participants, meId, text);
  return NextResponse.json({ message });
}
