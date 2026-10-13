import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { saveDirectReview } from '@/lib/directReview';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/friends/review  { revieweeId, verdict }
//
// ラウンドに紐づかないレビュー（友達申請の承認後 / QRで「同じ組」と答えた相手）。
// 保存の中身（reviews・_matchLikes・directReviews の done・マッチ通知）は
// lib/directReview.saveDirectReview に共通化してある（友達申請の受け手がその場で評価する経路と共用）。
//
// 選択肢も既存の4択と同じ。「異性として気になる」は異性のときだけ。
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const revieweeId = String(body?.revieweeId || '');
  const verdict = String(body?.verdict || '');

  if (!revieweeId || revieweeId === meId) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }

  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(revieweeId)]);
  if (!other) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  // この経路は、友達になっている相手にだけ書ける（承認/QR成立を経ていない相手は弾く）。
  if (!(me?.friendIds || []).includes(revieweeId)) {
    return NextResponse.json({ error: 'forbidden', message: 'この相手は評価できません' }, { status: 403, headers: noStore });
  }

  const r = await saveDirectReview({
    reviewerId: meId, revieweeId, verdict, source: 'friend_request', notifyMatch: true,
    reviewer: me, reviewee: other,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error, message: r.message }, { status: r.status, headers: noStore });
  }
  return NextResponse.json({ ok: true, matched: r.matched }, { headers: noStore });
}
