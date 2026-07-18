import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store' };

// POST /api/friends { userId }
// QRコードで直接つながる。片方が読み取れば相互に友達になる（両者の friendIds に追加）。
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch {}
  const otherId = String(body?.userId || '');
  if (!otherId || otherId === meId) return NextResponse.json({ error: 'bad_request', message: '相手が正しくありません' }, { status: 400, headers: noStore });

  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(otherId)]);
  if (!other) return NextResponse.json({ error: 'not_found', message: '相手が見つかりません' }, { status: 404, headers: noStore });

  // ブロック関係があれば友達にしない。
  if ((me?.blockedUserIds || []).includes(otherId) || (other?.blockedUserIds || []).includes(meId)) {
    return NextResponse.json({ error: 'blocked', message: 'この相手とは友達になれません' }, { status: 403, headers: noStore });
  }

  const myFriends = new Set(me?.friendIds || []);
  const theirFriends = new Set(other?.friendIds || []);
  const already = myFriends.has(otherId) && theirFriends.has(meId);
  myFriends.add(otherId);
  theirFriends.add(meId);
  await Promise.all([
    db.updateUser(meId, { friendIds: Array.from(myFriends) } as any),
    db.updateUser(otherId, { friendIds: Array.from(theirFriends) } as any),
  ]);

  // 相手にお知らせ（新規のときだけ）。
  if (!already) {
    try {
      const link = `/profile/${meId}`;
      const text = `${me?.displayName || 'ゴルファー'}さんと友達になりました（QRコード）🤝`;
      const { addNotification } = await import('@/lib/notifications');
      addNotification(otherId, 'invited', text, link).catch(() => {});
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (isNotifyEnabled(other as any, 'invited')) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        pushTo(otherId, text, liffUrl(link)).catch(() => {});
      }
    } catch { /* 通知失敗は無視 */ }
  }

  return NextResponse.json({ ok: true, already, friend: { id: otherId, displayName: other.displayName } }, { headers: noStore });
}
