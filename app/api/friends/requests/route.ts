import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import {
  createRequest, getRequest, isBlockedPair, listIncoming, listOutgoing,
  listQrPending, listDueDirectReviews, lockedUntil, setLock, QR_VISIBLE,
  type Claim,
} from '@/lib/friendLink';

const noStore = { 'Cache-Control': 'no-store' };

// GET  /api/friends/requests … 「友達の確認」画面の中身をまとめて返す
// POST /api/friends/requests … 友達申請を送る（claim='none' は送れない＝24時間ロック）
export const dynamic = 'force-dynamic';

const slim = (u: any) => u ? ({
  id: u.id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl,
  avatarMode: (u as any).avatarMode, color: u.color, age: u.age, area: u.area, gender: u.gender,
}) : null;

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const [incoming, outgoing, qrAll, reviews] = await Promise.all([
    listIncoming(meId), listOutgoing(meId), listQrPending(meId), listDueDirectReviews(meId),
  ]);
  // 表示は新しい順に QR_VISIBLE 人まで。データは消さず、残りは「もっと見る」で開く。
  const qr = qrAll.slice(0, QR_VISIBLE);

  const ids = Array.from(new Set([
    ...incoming.map((r) => r.fromId),
    ...outgoing.map((r) => r.toId),
    ...qrAll.map((q) => q.otherId),
    ...reviews.map((r) => r.revieweeId),
  ]));
  const users: Record<string, any> = {};
  try {
    const list = await db.listUsers(ids);
    list.forEach((u) => { if (u) users[u.id] = slim(u); });
  } catch { /* 名前が出なくても一覧は返す */ }

  return NextResponse.json({
    incoming, outgoing, qr, qrTotal: qrAll.length, qrHidden: Math.max(0, qrAll.length - qr.length),
    reviews, users,
    counts: { incoming: incoming.length, qr: qrAll.length, outgoing: outgoing.length, reviews: reviews.length },
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const toId = String(body?.toId || '');
  const claim = String(body?.claim || '');
  const metAt = String(body?.metAt || '');
  const message = String(body?.message || '').slice(0, 100);

  if (!toId || toId === meId) {
    return NextResponse.json({ error: 'bad_request', message: '相手が正しくありません' }, { status: 400, headers: noStore });
  }

  // どちらかが「ごめんなさい」を選んでいるペアは、友達申請でも繋がせない。
  // ここを開けておくと、遮断した相手から申請が届いて連絡が再開してしまう。
  // 断られた側に理由は返さない（「知られることはありません」の約束）。
  try {
    const { isBlocked } = await import('@/lib/dmBlock');
    if (await isBlocked(meId, toId)) {
      return NextResponse.json(
        { error: 'not_allowed', message: 'この方には申請できません' },
        { status: 403, headers: noStore },
      );
    }
  } catch { /* 判定できなければ通常フローへ */ }

  // 「どちらでもない」で送信 → 申請は作らず、この相手への申請を24時間ロックする。
  // ラジオを選んだ時点では何も起きない（送信を押して初めてここに来る）。
  if (claim === 'none') {
    const until = await setLock(meId, toId, 'none_of_the_above');
    return NextResponse.json({
      ok: false, blocked: true, lockedUntil: until,
      message: 'ゴルトモは「一緒に回った人」とつながる場所です。面識のない相手への申請は受け付けていません。',
    }, { headers: noStore });
  }

  if (claim !== 'same_group' && claim !== 'competition') {
    return NextResponse.json({ error: 'bad_request', message: 'どこで一緒だったかを選んでください' }, { status: 400, headers: noStore });
  }
  // 日付は必須。無いと受け手が思い出せず、承認の判断ができない。
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metAt)) {
    return NextResponse.json({ error: 'bad_request', message: 'いつのことか、日付を選んでください' }, { status: 400, headers: noStore });
  }
  const t = Date.parse(`${metAt}T00:00:00+09:00`);
  if (!isFinite(t) || t > Date.now() + 86400000) {
    return NextResponse.json({ error: 'bad_request', message: '未来の日付は選べません' }, { status: 400, headers: noStore });
  }

  const until = await lockedUntil(meId, toId);
  if (until) {
    return NextResponse.json({
      ok: false, blocked: true, lockedUntil: until,
      message: 'この相手への申請は、しばらくお待ちください。',
    }, { headers: noStore });
  }

  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(toId)]);
  if (!other) return NextResponse.json({ error: 'not_found', message: '相手が見つかりません' }, { status: 404, headers: noStore });
  if (await isBlockedPair(meId, toId)) {
    return NextResponse.json({ error: 'blocked', message: 'この相手には申請できません' }, { status: 403, headers: noStore });
  }
  if ((me?.friendIds || []).includes(toId)) {
    return NextResponse.json({ ok: false, message: 'すでに友達です' }, { headers: noStore });
  }
  const existing = await getRequest(meId, toId);
  if (existing && existing.status === 'pending') {
    return NextResponse.json({ ok: true, already: true, request: existing }, { headers: noStore });
  }

  const request = await createRequest({ fromId: meId, toId, claim, metAt, message });

  // 相手に知らせる。申告内容がそのまま質問になるので、通知文にも入れておく。
  try {
    const where = claim === 'same_group' ? '同じ組で回った' : '同じコンペにいた';
    const text = `🤝 ${me?.displayName || 'ゴルファー'}さんから友達申請（${where}・${metAt.replace(/-/g, '/')}）`;
    const link = '/friends/confirm';
    const { addNotification } = await import('@/lib/notifications');
    addNotification(toId, 'invited', text, link).catch(() => {});
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    if (isNotifyEnabled(other as any, 'invited')) {
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      pushTo(toId, text, liffUrl(link), 'friend_request').catch(() => {});
    }
  } catch { /* 通知が失敗しても申請自体は成立させる */ }

  return NextResponse.json({ ok: true, request }, { headers: noStore });
}
