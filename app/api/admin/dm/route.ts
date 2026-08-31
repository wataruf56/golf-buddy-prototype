import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from '@/lib/adminManagerId';
import { warmTestIds, isTestId } from '@/lib/testAccounts';


// 管理画面：1対1 DM（ダイレクトメッセージ）のログ。
//   GET ?token=..              → 直近のDMスレッド一覧（誰↔誰・最終メッセージ・時刻）
//   GET ?token=..&chatId=..    → そのスレッドのメッセージ内容（誰が誰に何を送ったか）
// ※ 個人間DMの本文を含む。運営（管理者）のみ ADMIN_LOG_TOKEN でアクセス可。
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const LIST_LIMIT = 500;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const nameOfId = async (id: string): Promise<string> => {
  if (id === ADMIN_MANAGER_ID) return ADMIN_MANAGER_NAME;
  const u = await db.getUser(id);
  return u?.displayName || id.slice(0, 10);
};

export async function GET(req: NextRequest) {
  // 手動登録したテストアカウントも外すため、最初に1回だけ読み込む。
  await warmTestIds();
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const chatId = new URL(req.url).searchParams.get('chatId') || '';

  // 詳細：1スレッドのメッセージ内容
  if (chatId) {
    const chat = await db.getChat(chatId);
    if (!chat) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const nameCache: Record<string, string> = {};
    for (const p of chat.participants || []) nameCache[p] = await nameOfId(p);
    const messages = (chat.messages || []).map((m) => ({
      senderId: m.senderId,
      senderName: nameCache[m.senderId] || (m.senderId || '').slice(0, 10),
      text: m.text || '',
      imageUrl: (m as any).imageUrl || '',
      createdAt: m.createdAt || 0,
    }));
    const parts = (chat.participants || []).map((id) => ({ id, name: nameCache[id] || id.slice(0, 10) }));
    return NextResponse.json({ chatId, participants: parts, messages }, { headers: noStore });
  }

  // 一覧：直近のDMスレッド（1対1のみ）
  const chats = await db.listRecentChats(LIST_LIMIT);
  // 動作確認用（test_）が関わるスレッドは出さない。実際のやりとりだけを見る。
  const dm = (chats || [])
    .filter((c) => (c.participants || []).length === 2)
    .filter((c) => !(c.participants || []).some((p: string) => isTestId(p)));
  // 名前をまとめて解決（重複ユーザーはキャッシュ）
  const nameCache: Record<string, string> = {};
  const resolve = async (id: string) => {
    if (nameCache[id] == null) nameCache[id] = await nameOfId(id);
    return nameCache[id];
  };
  const threads = await Promise.all(dm.map(async (c) => {
    const [aId, bId] = c.participants as [string, string];
    return {
      chatId: c.id,
      a: { id: aId, name: await resolve(aId) },
      b: { id: bId, name: await resolve(bId) },
      lastMessage: (c as any).lastMessage || '',
      lastMessageAt: c.lastMessageAt || 0,
    };
  }));
  return NextResponse.json({ threads }, { headers: noStore });
}
