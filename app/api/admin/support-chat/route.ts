import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatIdFor } from '@/lib/utils';
import { ADMIN_MANAGER_ID, ensureAdminManager } from '@/lib/adminManager';

// 管理画面：運営（管理人）とユーザーのDM（サポート窓口）。
//   GET  ?token=..            → 管理人チャット一覧（相手ユーザー・最終メッセージ・未読）
//   GET  ?token=..&userId=..  → そのユーザーとの会話（メッセージ全件）
//   POST ?token=..  { userId, text } → 管理人としてメッセージ送信（ユーザーへ通知）
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const userId = new URL(req.url).searchParams.get('userId') || '';

  if (userId) {
    // 特定ユーザーとの会話。
    const chatId = chatIdFor(ADMIN_MANAGER_ID, userId);
    const [chat, user] = await Promise.all([db.getChat(chatId), db.getUser(userId)]);
    // 管理人が読んだことにする（未読カウントをリセット）。
    try { await db.markChatRead(chatId, ADMIN_MANAGER_ID); } catch {}
    return NextResponse.json({
      user: user ? { id: user.id, displayName: user.displayName, avatar: user.avatar, avatarUrl: user.avatarUrl } : { id: userId, displayName: userId.slice(0, 10) },
      messages: chat?.messages || [],
    }, { headers: noStore });
  }

  // 一覧：管理人が参加している全チャット。
  try {
    const chats = await db.listChatsForUser(ADMIN_MANAGER_ID);
    const list = await Promise.all(chats.map(async (c) => {
      const otherId = c.participants.find((p) => p !== ADMIN_MANAGER_ID) || '';
      const u = otherId ? await db.getUser(otherId) : null;
      return {
        userId: otherId,
        displayName: u?.displayName || otherId.slice(0, 10),
        avatar: u?.avatar || '⛳',
        avatarUrl: u?.avatarUrl || '',
        lastMessage: c.lastMessage || '',
        lastMessageAt: c.lastMessageAt || 0,
        unread: c.unreadCount?.[ADMIN_MANAGER_ID] || 0,
      };
    }));
    list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    return NextResponse.json({ chats: list }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const userId = String(body.userId || '');
  const text = String(body.text || '').trim().slice(0, 2000);
  if (!userId || !text) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });

  const user = await db.getUser(userId);
  if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404, headers: noStore });

  await ensureAdminManager();
  const chatId = chatIdFor(ADMIN_MANAGER_ID, userId);
  const participants = [ADMIN_MANAGER_ID, userId].sort() as [string, string];
  try {
    const message = await db.sendMessage(chatId, participants, ADMIN_MANAGER_ID, text);
    // ユーザーへ通知（アプリ内 + LINE + Web push）。運営からの連絡は確実に届けたいので LINE も送る。
    const link = `/chat/${chatId}?other=${ADMIN_MANAGER_ID}`;
    try {
      const { addNotification } = await import('@/lib/notifications');
      addNotification(userId, 'dm', `🛡️ 管理人からメッセージが届きました`, link).catch(() => {});
    } catch {}
    try {
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      await pushTo(userId, `🛡️ 管理人からメッセージが届きました。`, liffUrl(link)).catch(() => {});
    } catch {}
    try {
      const { webPushText } = await import('@/lib/webPush');
      webPushText(userId, '管理人', text.slice(0, 80), link, `support-${userId}`).catch(() => {});
    } catch {}
    return NextResponse.json({ ok: true, message }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
