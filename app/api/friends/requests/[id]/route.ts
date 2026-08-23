import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import {
  createDirectReview, getRequest, linkFriends, pairId, setLock, setRequestStatus,
} from '@/lib/friendLink';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/friends/requests/[id]
//   受け手: { result: 'same_group' | 'competition' | 'none' }
//   申請者: { action: 'cancel' }
//
// 受け手の申告を正とする。申請者が「同じ組」と言っていても、受け手が
// 「コンペで一緒だっただけ」に訂正できる（レビューが★に効くため）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const [fromId, toId] = String(params.id || '').split('__');
  if (!fromId || !toId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }
  const request = await getRequest(fromId, toId);
  if (!request) return NextResponse.json({ error: 'not_found', message: '申請が見つかりません' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  // ── 申請者による取り消し ──
  if (body?.action === 'cancel') {
    if (meId !== fromId) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    await setRequestStatus(pairId(fromId, toId), { status: 'cancelled' });
    return NextResponse.json({ ok: true, cancelled: true }, { headers: noStore });
  }

  // ── 受け手による回答 ──
  if (meId !== toId) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  if (request.status !== 'pending') {
    return NextResponse.json({ ok: true, already: true }, { headers: noStore });
  }

  const result = String(body?.result || '');
  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(fromId)]);

  // 心当たりがない → 追加せず却下。申請者には伝えず、24時間ロックだけかける。
  if (result === 'none') {
    await setRequestStatus(pairId(fromId, toId), { status: 'declined' });
    await setLock(fromId, toId, 'declined');
    return NextResponse.json({ ok: true, declined: true }, { headers: noStore });
  }

  if (result !== 'same_group' && result !== 'competition') {
    return NextResponse.json({ error: 'bad_request', message: '選択してください' }, { status: 400, headers: noStore });
  }

  await setRequestStatus(pairId(fromId, toId), { status: 'accepted', accepted: result });
  await linkFriends(fromId, toId);

  // 同じ組だったときだけ、双方に相互レビューを用意する。
  // 承認したその場で答えられるよう dueAt は「いま」。
  if (result === 'same_group') {
    const now = Date.now();
    await Promise.all([
      // 承認した本人はこのあとすぐ評価画面に進み、申請者には下の「承認されました」
      // 通知でレビューへのリンクを送る。cron から重ねて催促しない。
      createDirectReview({ reviewerId: meId, revieweeId: fromId, source: 'friend_request', dueAt: now, alreadyNotified: true }),
      createDirectReview({ reviewerId: fromId, revieweeId: meId, source: 'friend_request', dueAt: now, alreadyNotified: true }),
    ]);
  }

  // 申請者に「承認された」ことを知らせる（却下は知らせない）。
  try {
    const text = result === 'same_group'
      ? `🤝 ${me?.displayName || 'ゴルファー'}さんと友達になりました。お互いを評価できます。`
      : `🤝 ${me?.displayName || 'ゴルファー'}さんと友達になりました。`;
    const link = result === 'same_group' ? '/friends/confirm?tab=review' : `/profile/${meId}`;
    const { addNotification } = await import('@/lib/notifications');
    addNotification(fromId, 'invited', text, link).catch(() => {});
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    if (isNotifyEnabled(other as any, 'invited')) {
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      pushTo(fromId, text, liffUrl(link), 'friend').catch(() => {});
    }
  } catch { /* noop */ }

  return NextResponse.json({ ok: true, accepted: result }, { headers: noStore });
}
