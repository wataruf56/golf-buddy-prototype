import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { blockDm, unblockDm, closeDm, reopenDm } from './dmBlock';

// マッチしている相手への「いまの気持ち」を選び直す共通処理（2026-10-11 切り出し）。
// 再会画面（/api/rematch/[pairId]/feeling）と、DM画面・プロフィールの
// 「まだ一緒にラウンドしてみたいと思う？」（/api/me/match-feeling）の両方から使う。
//
//   again    … 行きたい（romantic からの切り替えもここ＝友人として）
//   romantic … 💘 異性として気になる（again も同時にON）
//   either   … どっちでも → マッチ解除＋やり取りの履歴を理由にしたDMも閉じる
//   never    … 思わない   → マッチ解除＋双方向でDMを閉じる
// 過去のレビューの verdict も書き換える（★と「行きたい」の人数に反映される）。相手には通知しない。
export type Feeling = 'again' | 'romantic' | 'either' | 'never';
export const FEELINGS: Feeling[] = ['again', 'romantic', 'either', 'never'];

const likeId = (kind: 'again' | 'romantic', from: string, to: string) => `${kind}__${from}__${to}`;

async function setLike(kind: 'again' | 'romantic', from: string, to: string, on: boolean, roundId?: string) {
  const adb = getAdminDb() as any;
  if (!adb) return;
  const ref = adb.collection('_matchLikes').doc(likeId(kind, from, to));
  try {
    if (on) await ref.set({ kind, from, to, ...(roundId ? { roundId } : {}), at: Date.now() }, { merge: true });
    else await ref.delete();
  } catch (e) {
    console.error('[matchFeeling] like write failed', (e as Error).message);
  }
}

// 過去のレビューの verdict を書き換える。無ければ作る（レビュー未提出のままマッチしているケースがあるため）。
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
    console.error('[matchFeeling] review lookup failed', (e as Error).message);
  }
  if (!roundId) return;
  try {
    await db.createReview({
      roundId, reviewerId, revieweeId, stars: 0, tags: [], comment: '',
      verdict, createdAt: Date.now(), isAnonymous: true,
    } as any);
  } catch (e) {
    console.error('[matchFeeling] review create failed', (e as Error).message);
  }
}

/** 2人が一緒だった直近の完了ラウンド（レビューを書き換える先） */
export async function lastSharedRoundId(a: string, b: string): Promise<string> {
  try {
    const completed = (await db.listRounds({ status: 'completed' }))
      .filter((r) => { const m = [r.hostId, ...(r.applicantIds || [])]; return m.includes(a) && m.includes(b); })
      .sort((x, y) => (y.completedAt || 0) - (x.completedAt || 0));
    return completed[0]?.id || '';
  } catch { return ''; }
}

export async function applyFeeling(meId: string, otherId: string, feeling: Feeling, roundId: string): Promise<void> {
  // 1. マッチの記録
  if (feeling === 'romantic') {
    await setLike('again', meId, otherId, true, roundId);
    await setLike('romantic', meId, otherId, true, roundId);
  } else if (feeling === 'again') {
    await setLike('again', meId, otherId, true, roundId);
    await setLike('romantic', meId, otherId, false);
  } else {
    await setLike('again', meId, otherId, false);
    await setLike('romantic', meId, otherId, false);
  }
  // 2. 過去のレビュー
  await upsertVerdict(meId, otherId, roundId, feeling);
  // 3. DMの遮断：思わない＝完全に閉じる／どっちでも＝履歴を理由にした例外だけ閉じる／行きたい・💘＝解く
  if (feeling === 'never') await blockDm(meId, otherId, roundId);
  else await unblockDm(meId, otherId);
  if (feeling === 'either') await closeDm(meId, otherId, roundId);
  else if (feeling === 'again' || feeling === 'romantic') await reopenDm(meId, otherId);
}
