import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } from '@/lib/adminManagerId';

// 管理画面：未読メッセージのあるユーザー一覧と、その内訳（何が未読か）。
//   GET ?token=..              → 未読があるユーザー一覧
//   GET ?token=..&userId=..    → そのユーザーの未読内訳（Markdown＋構造化データ）
// ※ DM（1対1チャット）の未読を対象（未読まとめ通知と同じ範囲）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const CHATS_LIMIT = 3000;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

function jst(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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

  const detail = await Promise.all(myChats.map(async (c) => {
    const otherId = (c.participants || []).find((p) => p !== userId) || '';
    const otherName = await nameOfId(otherId);
    const unread = ((c as any).unreadCount || {})[userId] || 0;
    const full = await db.getChat(c.id);
    const msgs = (full?.messages || []).slice().sort((a, b) => a.createdAt - b.createdAt);
    const recent = msgs.slice(-Math.max(unread, 8)); // 未読分＋前後の文脈
    return {
      chatId: c.id, otherId, otherName, unread,
      lastAt: (c as any).lastMessageAt || 0,
      messages: recent.map((m) => ({
        senderId: m.senderId,
        senderLabel: m.senderId === userId ? '本人' : m.senderId === ADMIN_MANAGER_ID ? ADMIN_MANAGER_NAME : otherName,
        fromOther: m.senderId !== userId,
        text: m.text || (m.imageUrl ? '📷 画像' : ''),
        createdAt: m.createdAt,
      })),
    };
  }));
  detail.sort((a, b) => b.lastAt - a.lastAt);
  const total = detail.reduce((s, d) => s + d.unread, 0);

  // Markdown 生成。
  const lines: string[] = [];
  lines.push(`# 📩 ${targetName} の未読メッセージ`);
  lines.push('');
  lines.push(`- ユーザーID: \`${userId}\``);
  lines.push(`- 未読合計: **${total}件**（${detail.length}つのチャット）`);
  const prof = [target?.age ? `${target.age}歳` : '', target?.gender === 'male' ? '男性' : target?.gender === 'female' ? '女性' : '', target?.area, target?.scoreRange].filter(Boolean).join(' ・ ');
  if (prof) lines.push(`- プロフィール: ${prof}`);
  lines.push('');
  for (const d of detail) {
    lines.push('---');
    lines.push(`## 💬 ${d.otherName}（未読 ${d.unread}件）`);
    lines.push(`最終メッセージ: ${jst(d.lastAt)}`);
    lines.push('');
    for (const m of d.messages) {
      const marker = m.fromOther ? '🔵' : '⚪️';
      lines.push(`- ${marker} **${m.senderLabel}**: ${m.text.replace(/\n/g, ' ')} _(${jst(m.createdAt)})_`);
    }
    lines.push('');
  }
  const markdown = lines.join('\n');

  return NextResponse.json({
    user: { userId, name: targetName },
    total, detail, markdown,
  }, { headers: noStore });
}
