import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { getSession, saveSession, membersOfPair } from '@/lib/rematch';
import { blockDm, unblockDm } from '@/lib/dmBlock';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 再会の画面で「いまの気持ち」を選び直す。
//
// 1ヶ月前に「また回りたい」と押していても、いま同じとは限らない。
// ここで選び直すと、**過去のレビューとマッチがその場で書き換わる**。
//
//   again    … また回りたい（友人として。romantic からの切り替えもここ）
//   romantic … 異性として気になる（again も同時にON＝既存の運用に合わせる）
//   either   … どっちでもいい → マッチ解除。DMは友達申請が要るようになる
//   never    … ごめんなさい   → マッチ解除＋**双方向でDMを閉じる**
//
// 「ごめんなさい」から選び直した場合は遮断を解く（また一緒に回ったときの復活）。
type Feeling = 'again' | 'romantic' | 'either' | 'never';
const FEELINGS: Feeling[] = ['again', 'romantic', 'either', 'never'];

const likeId = (kind: 'again' | 'romantic', from: string, to: string) => `${kind}__${from}__${to}`;

async function setLike(kind: 'again' | 'romantic', from: string, to: string, on: boolean, roundId?: string) {
  const adb = getAdminDb() as any;
  if (!adb) return;
  const ref = adb.collection('_matchLikes').doc(likeId(kind, from, to));
  try {
    if (on) await ref.set({ kind, from, to, ...(roundId ? { roundId } : {}), at: Date.now() }, { merge: true });
    else await ref.delete();
  } catch (e) {
    console.error('[feeling] like write failed', (e as Error).message);
  }
}

// 過去のレビューの verdict を書き換える。無ければ作る（レビュー未提出のまま
// 再会通知だけ届いているケースがあるため）。
async function upsertVerdict(reviewerId: string, revieweeId: string, roundId: string, verdict: Feeling) {
  const adb = getAdminDb() as any;
  if (!adb) return;
  try {
    const snap = await adb.collection('reviews')
      .where('reviewerId', '==', reviewerId).where('revieweeId', '==', revieweeId).limit(20).get();
    const hit = snap.docs.find((d: any) => (d.data() || {}).roundId === roundId) || snap.docs[0];
    if (hit) {
      await hit.ref.set({ verdict, updatedAt: Date.now() }, { merge: true });
      return;
    }
  } catch (e) {
    console.error('[feeling] review lookup failed', (e as Error).message);
  }
  try {
    await db.createReview({
      roundId, reviewerId, revieweeId, stars: 0, tags: [], comment: '',
      verdict, createdAt: Date.now(), isAnonymous: true,
    } as any);
  } catch (e) {
    console.error('[feeling] review create failed', (e as Error).message);
  }
}

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const feeling = String(body?.feeling || '') as Feeling;
  if (!FEELINGS.includes(feeling)) {
    return NextResponse.json({ error: 'bad_request', message: '選択が不正です' }, { status: 400, headers: noStore });
  }

  const otherId = s.userA === meId ? s.userB : s.userA;
  const roundId = s.roundId || '';

  // 1. マッチの記録を作り直す
  if (feeling === 'romantic') {
    await setLike('again', meId, otherId, true, roundId);
    await setLike('romantic', meId, otherId, true, roundId);
  } else if (feeling === 'again') {
    await setLike('again', meId, otherId, true, roundId);
    await setLike('romantic', meId, otherId, false);   // 友人としてに切り替え
  } else {
    await setLike('again', meId, otherId, false);
    await setLike('romantic', meId, otherId, false);
  }

  // 2. 過去のレビューを書き換える
  if (roundId) await upsertVerdict(meId, otherId, roundId, feeling);

  // 3. DMの遮断
  if (feeling === 'never') await blockDm(meId, otherId, roundId);
  else await unblockDm(meId, otherId);

  // 4. 再会セッションの扱い
  //    続ける場合は matchKind を選び直した内容に合わせる（romantic → again の切り替え）。
  //    やめる場合は終了させる。相手の画面には「この再会は終了しました」とだけ出す。
  if (feeling === 'again' || feeling === 'romantic') {
    await saveSession(pairId, { matchKind: feeling } as any);
  } else {
    const optedOutBy = Array.from(new Set([...(s.optedOutBy || []), meId]));
    await saveSession(pairId, { optedOutBy, status: 'optedout' } as any);
  }

  // 相手には通知しない（「知られることはありません」の約束）。
  return NextResponse.json({
    ok: true, feeling,
    ended: feeling === 'either' || feeling === 'never',
    blocked: feeling === 'never',
  }, { headers: noStore });
}
