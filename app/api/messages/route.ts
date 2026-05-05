import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/auth';
import { mockChats } from '@/lib/mockData';
import { getAdminDb } from '@/lib/firebase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return NextResponse.json({ messages: [] });

  if (isDemoMode) {
    const chat = mockChats.find((c) => c.id === chatId);
    return NextResponse.json({ messages: chat?.messages || [] });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ messages: [] });
  const snap = await db.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'asc').get();
  return NextResponse.json({ messages: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
}

export async function POST(req: NextRequest) {
  const { chatId, senderId, text } = await req.json();
  if (isDemoMode) {
    return NextResponse.json({ ok: true, id: `m_${Date.now()}` });
  }
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ ok: false, error: 'no-db' }, { status: 500 });
  const now = Date.now();
  await db.collection('chats').doc(chatId).collection('messages').add({ senderId, text, createdAt: now, read: false });
  await db.collection('chats').doc(chatId).set({ lastMessage: text, lastMessageAt: now }, { merge: true });
  return NextResponse.json({ ok: true });
}
