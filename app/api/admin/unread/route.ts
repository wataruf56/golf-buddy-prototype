import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from '@/lib/adminManagerId';
import { getAdminDb } from '@/lib/firebase';
import { isDemoMode } from '@/lib/demoMode';
import type { Message } from '@/lib/types';

// 管理画面：未読メッセージのあるユーザー一覧と、その内訳（何が未読か）。
//   GET ?token=..              → 未読があるユーザー一覧
//   GET ?token=..&userId=..    → そのユーザーの未読内訳（未読メッセージの本文つき・Markdown＋構造化データ）
// ※ DM（1対1チャット）の未読を対象（未読まとめ通知と同じ範囲）。
// ※ 2026-10-12 から本文も出す（DMログと同じく運営だけが見られる）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const CHATS_LIMIT = 3000;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// サーバーはUTCで動くので、日本時間を明示する（2026-10-12）
function jst(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 未読＝相手から届いた最新の n 通（未読数は相手が送るたびに +1、本人が開くと 0 に戻る）。
// db.getChat は古い順に200通までなので、長いやり取りだと新しい未読が入らない。ここでは新しい順に直接読む（2026-10-12）
async function latestUnreadMessages(chatId: string, readerId: string, n: number): Promise<Message[]> {
  if (n <= 0) return [];
  const take = Math.min(300, n + 30);
  let msgs: Message[] = [];
  const adb = isDemoMode ? null : (getAdminDb() as any);
  try {
    if (adb) {
      const snap = await adb.collection('chats').doc(chatId).collection('messages').orderBy('createdAt', 'desc').limit(take).get();
      msgs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Message[];
    } else {
      const chat = await db.getChat(chatId);
      msgs = [...(chat?.messages || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch { return []; }
  // 新しい順に相手からのものを n 通 → 古い順に並べ直す
  return msgs.filter((m) => m.senderId !== readerId).slice(0, n).reverse();
}
const nameOfId = async (id: string): Promise<string> => {
  if (id === ADMIN_MANAGER_ID) return ADMIN_MANAGER_NAME;
  const u = await db.getUser(id);
  return u?.displayName || id.slice(0, 10);
};

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const userId = new URL(req.url).searchParams.get('userId') || '';
  const chats = await db.listRecentChats(CHATS_LIMIT);

  if (!userId) {
    // 一覧：未読があるユーザーごとに集計。
    const agg: Record<string, { total: number; chats: number; lastAt: number }> = {};
    for (const c of chats) {
      const uc = (c as any).unreadCount || {};
      for (const uid of Object.keys(uc)) {
        const n = uc[uid] || 0;
        if (n <= 0 || uid === ADMIN_MANAGER_ID) continue;
        if (!agg[uid]) agg[uid] = { total: 0, chats: 0, lastAt: 0 };
        agg[uid].total += n;
        agg[uid].chats += 1;
        agg[uid].lastAt = Math.max(agg[uid].lastAt, (c as any).lastMessageAt || 0);
      }
    }
    const users = await Promise.all(Object.entries(agg).map(async ([uid, v]) => ({
      userId: uid, name: await nameOfId(uid), unread: v.total, chats: v.chats, lastAt: v.lastAt,
    })));
    users.sort((a, b) => b.lastAt - a.lastAt);
    return NextResponse.json({ users, totalUsers: users.length }, { headers: noStore });
  }

  // 詳細：このユーザーが未読を持つチャットの内訳。
  const target = await db.getUser(userId);
  const targetName = target?.displayName || userId.slice(0, 10);
  const myChats = chats.filter((c) => (c.participants || []).includes(userId) && (((c as any).unreadCount || {})[userId] || 0) > 0);

  // チャット単位で「機能・誰から本人へ・未読件数・最終受信時刻」と、未読メッセージの本文を出す（2026-10-12）。
  // 画像はデータURLで重いので「画像あり」だけ返す。
  const detail = await Promise.all(myChats.map(async (c) => {
    const otherId = (c.participants || []).find((p) => p !== userId) || '';
    const otherName = await nameOfId(otherId);
    const isAdmin = otherId === ADMIN_MANAGER_ID;
    const unread = ((c as any).unreadCount || {})[userId] || 0;
    const msgs = await latestUnreadMessages(c.id, userId, unread);
    return {
      chatId: c.id,
      feature: isAdmin ? '管理人チャット' : 'DM',
      fromId: otherId, fromName: otherName,
      unread,
      lastAt: (c as any).lastMessageAt || 0,
      messages: msgs.map((m) => ({
        senderId: m.senderId,
        senderName: m.senderId === otherId ? otherName : (m.senderId === userId ? targetName : (m.senderId || '').slice(0, 10)),
        text: m.text || '',
        hasImage: !!(m as any).imageUrl,
        createdAt: m.createdAt || 0,
      })),
    };
  }));
  detail.sort((a, b) => b.lastAt - a.lastAt);
  const total = detail.reduce((s, d) => s + d.unread, 0);

  // Markdown 生成（コピー用。未読の本文つき）。
  const lines: string[] = [];
  lines.push(`# 📩 ${targetName} の未読`);
  lines.push('');
  lines.push(`- ユーザーID: \`${userId}\``);
  lines.push(`- 未読合計: **${total}件**（${detail.length}件のやり取り）`);
  lines.push('');
  lines.push('※ 個人間のやり取りです。取り扱いに注意。');
  lines.push('');
  for (const d of detail) {
    lines.push('---');
    lines.push(`## ${d.feature === 'DM' ? '💬 DM' : '🛡️ 管理人チャット'}`);
    lines.push(`- ${d.fromName} → **${targetName}**`);
    lines.push(`- 未読: **${d.unread}件**`);
    lines.push(`- 最終受信: ${jst(d.lastAt)}`);
    lines.push('');
    for (const m of d.messages) {
      const body = [m.text, m.hasImage ? '📷 画像' : ''].filter(Boolean).join(' ');
      lines.push(`### ${m.senderName}（${jst(m.createdAt)}）`);
      lines.push(body || '（本文なし）');
      lines.push('');
    }
  }
  const markdown = lines.join('\n');

  return NextResponse.json({
    user: { userId, name: targetName },
    total, detail, markdown,
  }, { headers: noStore });
}
