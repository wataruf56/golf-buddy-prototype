import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// 本人が LINE公式アカウントを友だち追加しているかを、その場で確かめる。
//   POST /api/me/friendship → { friend: true | false | null }
//   true  … 追加済み（users.botFollowed=true に保存）
//   false … 未追加（同 false に保存）
//   null  … 判定できなかった（トークン未設定・LINE側のエラーなど）
// 判定は Messaging API の「プロフィール取得」。友だちでない相手は 404 が返る
// （管理画面の「誰が友だち追加していないか調べる」と同じ方法）。
// 使い道：本登録と参加申込の前に「友だち追加（必須）」の関所で押す（components/FriendGate）。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  // LINE の userId（U…）以外（テスト垢・管理人）は判定できない
  if (!token || !meId.startsWith('U')) return NextResponse.json({ friend: null }, { headers: noStore });

  let friend: boolean | null = null;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(meId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (r.ok) friend = true;
    else if (r.status === 404) friend = false;
  } catch { friend = null; }

  if (friend !== null) {
    try { await db.updateUser(meId, { botFollowed: friend, botFollowedAt: Date.now() } as any); } catch { /* 保存できなくても答えは返す */ }
  }
  return NextResponse.json({ friend }, { headers: noStore });
}
