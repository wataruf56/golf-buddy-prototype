import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import {
  createDirectReview, getRequest, linkFriends, pairId, setLock, setRequestStatus,
} from '@/lib/friendLink';
import { isDirectVerdict, isOppositeSex, saveDirectReview } from '@/lib/directReview';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/friends/requests/[id]
//   受け手: { result: 'same_group' | 'competition' | 'none', friend?: boolean, review?: { verdict } }
//   申請者: { action: 'cancel' }
//
// 受け手の流れ（2026-10-13〜）:
//   1. 事実の確認 … 同じ組でした（same_group）／コンペで一緒だっただけ（competition）／心当たりがない（none）
//      受け手の申告を正とする。申請者が「同じ組」と言っていても訂正できる（レビューが★に効くため）。
//   2. same_group のときだけ、その場で評価（review.verdict 必須）。
//      申請者は「同じ組」と言い、受け手もそれを認めたので、友達になるかどうかに関係なく保存する
//      （/api/friends/review の「友達である」条件はこの経路では見ない）。
//   3. 友達になる（friend=true）→ linkFriends。status='accepted'。
//      友達にならない（friend=false）→ status='confirmed_no_friend'＋24時間ロック。
//   **どれを選んでも申請者には通知しない**（承認の通知・LINEも出さない）。
//   申請者の画面では「ならない」「心当たりなし」は「返事待ち」のまま（listOutgoing）。
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

  // 心当たりがない → 追加せず却下。申請者には伝えず、24時間ロックだけかける。
  if (result === 'none') {
    await setRequestStatus(pairId(fromId, toId), { status: 'declined' });
    await setLock(fromId, toId, 'declined');
    return NextResponse.json({ ok: true, declined: true }, { headers: noStore });
  }

  if (result !== 'same_group' && result !== 'competition') {
    return NextResponse.json({ error: 'bad_request', message: '選択してください' }, { status: 400, headers: noStore });
  }
  if (typeof body?.friend !== 'boolean') {
    return NextResponse.json({ error: 'bad_request', message: '友達になるかどうかを選んでください' }, { status: 400, headers: noStore });
  }
  const friend: boolean = body.friend;

  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(fromId)]);
  if (!other) return NextResponse.json({ error: 'not_found', message: '相手が見つかりません' }, { status: 404, headers: noStore });

  // 同じ組 → 評価が必須。状態を変える前に中身を検証しておく（途中で失敗して半端に残さない）。
  let reviewed = false;
  let matched = false;
  if (result === 'same_group') {
    const verdict = String(body?.review?.verdict || '');
    if (!isDirectVerdict(verdict)) {
      return NextResponse.json({ error: 'bad_request', message: '評価を選んでください' }, { status: 400, headers: noStore });
    }
    if (verdict === 'romantic' && !isOppositeSex(me, other)) {
      return NextResponse.json({ error: 'not_opposite_sex', message: '「異性として気になる」は異性の相手のみ選べます' }, { status: 403, headers: noStore });
    }
    // マッチが成立しても通知はしない（申請者に何も伝えない約束）。受け手には画面で伝える。
    const r = await saveDirectReview({
      reviewerId: meId, revieweeId: fromId, verdict, source: 'friend_request', notifyMatch: false,
      reviewer: me, reviewee: other,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error, message: r.message }, { status: r.status, headers: noStore });
    }
    reviewed = true;
    matched = r.matched;
  }

  if (!friend) {
    // 会ったことは認めたが友達にはならない。申請者には「返事待ち」のまま見せ、
    // 取り消し→再申請で何度も届かないよう、心当たりなしと同じく24時間ロックする。
    await setRequestStatus(pairId(fromId, toId), { status: 'confirmed_no_friend', accepted: result, reviewed });
    await setLock(fromId, toId, 'not_friend');
    return NextResponse.json({ ok: true, friend: false, accepted: result, matched }, { headers: noStore });
  }

  await setRequestStatus(pairId(fromId, toId), { status: 'accepted', accepted: result, reviewed });
  await linkFriends(fromId, toId);

  // 同じ組で友達になったときは、申請者の側にも評価の依頼を用意する（相互レビュー）。
  // 通知はしない：alreadyNotified=true で cron からの催促も止める。申請者は「評価」タブで見つけたら答える。
  // ※ 友達にならない場合は作らない（申請者の画面に出ると「返事待ち」でないことが分かってしまう）。
  if (result === 'same_group') {
    await createDirectReview({
      reviewerId: fromId, revieweeId: meId, source: 'friend_request', dueAt: Date.now(), alreadyNotified: true,
    });
  }

  return NextResponse.json({ ok: true, friend: true, accepted: result, matched }, { headers: noStore });
}
