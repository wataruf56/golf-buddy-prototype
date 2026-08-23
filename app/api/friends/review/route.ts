import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { addNotification } from '@/lib/notifications';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { pushTo, liffUrl } from '@/lib/linePush';
import { markDirectReviewDone } from '@/lib/friendLink';
import type { ReviewVerdict } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/friends/review  { revieweeId, verdict }
//
// ラウンドに紐づかないレビュー（友達申請の承認後 / QRで「同じ組」と答えた相手）。
// 書き込む先は通常のレビューとまったく同じ:
//   - reviews      … ★（また回りたい率）の分母と never を決める
//   - _matchLikes  … again / romantic のマッチ判定
// なので集計側（/api/users/ratings・track-record・LPの実績）に手を入れる必要はない。
//
// 選択肢も既存の4択と同じ。「異性として気になる」は異性のときだけ。
const VERDICTS: ReviewVerdict[] = ['again', 'romantic', 'never', 'either'];
const likeId = (kind: 'again' | 'romantic', from: string, to: string) => `${kind}__${from}__${to}`;

async function likeExists(adb: any, id: string): Promise<boolean> {
  if (!adb) return false;
  try { const s = await adb.collection('_matchLikes').doc(id).get(); return s.exists; }
  catch { return false; }
}
async function setLike(adb: any, id: string, data: any, on: boolean) {
  if (!adb) return;
  try {
    if (on) await adb.collection('_matchLikes').doc(id).set(data, { merge: true });
    else await adb.collection('_matchLikes').doc(id).delete();
  } catch { /* noop */ }
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const revieweeId = String(body?.revieweeId || '');
  const verdict = String(body?.verdict || '') as ReviewVerdict;

  if (!revieweeId || revieweeId === meId || !VERDICTS.includes(verdict)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }

  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(revieweeId)]);
  if (!other) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  // 友達になっている相手にだけ書ける（承認/QR成立を経ていない相手は弾く）。
  if (!(me?.friendIds || []).includes(revieweeId)) {
    return NextResponse.json({ error: 'forbidden', message: 'この相手は評価できません' }, { status: 403, headers: noStore });
  }

  // 「異性として気になる」は異性同士のときだけ（ラウンド後レビューと同じ制約）。
  const g1 = me?.gender, g2 = other?.gender;
  const opposite = (g1 === 'male' || g1 === 'female') && (g2 === 'male' || g2 === 'female') && g1 !== g2;
  if (verdict === 'romantic' && !opposite) {
    return NextResponse.json({ error: 'not_opposite_sex', message: '「異性として気になる」は異性の相手のみ選べます' }, { status: 403, headers: noStore });
  }

  // roundId は「どこで一緒だったか」の代わりに direct を入れる。
  // 集計側は roundId を見ていないので、これで問題ない。
  await db.createReview({
    roundId: 'direct',
    reviewerId: meId,
    revieweeId,
    stars: 0,
    tags: [],
    verdict,
    createdAt: Date.now(),
    isAnonymous: true,
  } as any);

  const adb = getAdminDb() as any;
  const wantRomantic = verdict === 'romantic';
  const wantAgain = verdict === 'romantic' || verdict === 'again';
  const againExisted = await likeExists(adb, likeId('again', meId, revieweeId));

  await setLike(adb, likeId('romantic', meId, revieweeId),
    { from: meId, to: revieweeId, kind: 'romantic', roundId: 'direct', ts: Date.now() }, wantRomantic);
  await setLike(adb, likeId('again', meId, revieweeId),
    { from: meId, to: revieweeId, kind: 'again', roundId: 'direct', ts: Date.now() }, wantAgain);

  await markDirectReviewDone(meId, revieweeId);

  // マッチ（相互いいね）が **新しく** 成立したときだけ知らせる。
  let matched = false;
  if (wantAgain && !againExisted) {
    matched = await likeExists(adb, likeId('again', revieweeId, meId));
    if (matched) {
      const link = '/buddies?tab=again';
      const notify = async (uid: string, user: any, partner: string) => {
        await addNotification(uid, 'match', `🎉 ${partner}さんとマッチしました！「また回りたい」同士です`, link);
        if (isNotifyEnabled(user, 'match')) {
          pushTo(uid, `🎉 ${partner}さんとマッチしました！`, liffUrl(link), 'match').catch(() => {});
        }
      };
      await notify(revieweeId, other, me?.displayName || '相手');
      await notify(meId, me, other?.displayName || '相手');
    }
  }

  return NextResponse.json({ ok: true, matched }, { headers: noStore });
}
