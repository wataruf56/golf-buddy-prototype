import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// GET /api/me/dm-unread … DM（1対1）の未読件数だけを軽く返す（2026-10-15）。
// 下のタブ「ゴル友」のバッジを、画面を開いたままでも更新するため（lib/useUnread が1分弱ごとに呼ぶ）。
// 中身は bootstrap の chats と同じ（db.listChatsForUser）。メッセージ本文は返さない（最後の一言だけ）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ chats: [], total: 0 }, { headers: noStore });
  try {
    const chats = await db.listChatsForUser(meId);
    const out = chats.map((c) => ({
      id: c.id, participants: c.participants,
      unread: Math.max(0, Number(c.unreadCount?.[meId]) || 0),
      lastMessage: String(c.lastMessage || '').slice(0, 60), lastMessageAt: c.lastMessageAt || 0,
    }));
    return NextResponse.json({ chats: out, total: out.reduce((a, b) => a + b.unread, 0) }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ chats: [], total: 0, error: (e as Error).message }, { headers: noStore });
  }
}
