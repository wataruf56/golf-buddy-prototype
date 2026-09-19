import 'server-only';
import { getAdminDb } from './firebase';

// 「ごめんなさい」を選んだ相手とのDM遮断。
//
// 【なぜ双方向か】
// 断った本人だけが送れる状態にすると、断られた側に**返信できないメッセージ**が届く。
// 返信しようとして初めて弾かれるので、そこで遮断に気づかれてしまう。
// 「相手に知られることはありません」という約束を守るには、両方向を閉じるしかない。
//
// 【誰の意思で決まるか】
// 片方が「ごめんなさい」を選べば成立する。相手の同意は要らない。
//
// docId は 2つのIDを並べ替えて連結したもの（ペア単位で1件）。
// by には「誰が断ったか」を残す。断った本人にだけ画面で理由を出すため。

const COLL = '_dmBlocks';

export const blockId = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);

export type DmBlock = { pairId: string; by: string; at: number; roundId?: string };

/** 「ごめんなさい」を記録して、この2人のDMを閉じる。 */
export async function blockDm(by: string, other: string, roundId?: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !by || !other || by === other) return;
  const id = blockId(by, other);
  try {
    await adb.collection(COLL).doc(id).set(
      // members は一括判定（array-contains）用。これが無いと全件走査になる。
      { pairId: id, members: [by, other].sort(), by, at: Date.now(), ...(roundId ? { roundId } : {}) },
      { merge: true },
    );
  } catch (e) {
    console.error('[dmBlock] set failed', (e as Error).message);
  }
}

/** 遮断を解く。また一緒に回って「また回りたい」を選び直したときに呼ぶ。 */
export async function unblockDm(a: string, b: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !a || !b) return;
  try { await adb.collection(COLL).doc(blockId(a, b)).delete(); }
  catch { /* もともと無ければそれでよい */ }
}

/** この2人が遮断されているか（どちらが断ったかは問わない）。 */
export async function isBlocked(a: string, b: string): Promise<boolean> {
  const adb = getAdminDb() as any;
  if (!adb || !a || !b) return false;
  try { return (await adb.collection(COLL).doc(blockId(a, b)).get()).exists; }
  catch { return false; }
}

/** 誰が断ったか。断った本人にだけ理由を出すために使う。 */
export async function blockedBy(a: string, b: string): Promise<string | null> {
  const adb = getAdminDb() as any;
  if (!adb || !a || !b) return null;
  try {
    const s = await adb.collection(COLL).doc(blockId(a, b)).get();
    return s.exists ? (s.data()?.by || null) : null;
  } catch { return null; }
}

/** meId が遮断している／されている相手の集合（一括判定用に1クエリで引く）。 */
export async function blockedSetOf(meId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const adb = getAdminDb() as any;
  if (!adb || !meId) return out;
  // docId が `${小さい方}__${大きい方}` なので、前方一致と「自分が後ろ」の2通りを引く。
  // pairId とは別に members 配列を持たせるより、既存データが無い今のうちは
  // 2クエリで済ませるほうが単純。
  try {
    const snap = await adb.collection(COLL).where('members', 'array-contains', meId).limit(1000).get();
    snap.docs.forEach((d: any) => {
      const m: string[] = d.data()?.members || [];
      m.forEach((x) => { if (x && x !== meId) out.add(x); });
    });
  } catch { /* インデックス未作成などは下のフォールバックで拾う */ }
  if (out.size) return out;
  // フォールバック：members が無い古いデータでも docId から解ける。
  try {
    const snap = await adb.collection(COLL).limit(3000).get();
    snap.docs.forEach((d: any) => {
      const [x, y] = String(d.id).split('__');
      if (x === meId && y) out.add(y);
      else if (y === meId && x) out.add(x);
    });
  } catch { /* noop */ }
  return out;
}

// ── 「どっちでもいい」でのやわらかい遮断 ─────────────────────────
//
// 【何を解いているか】
// DMの規則には「すでにやり取りのある相手とは送り続けられる」という例外がある
// （lib/dmPolicy の 7・8）。条件を絞った日に進行中の会話が切れないようにするためのもの。
// ところがこの例外のせいで、再会画面で「どっちでもいい」を選んでマッチを外しても、
// 一度でもDMしたことのある相手からは**ずっと届き続けた**。
// 追いDMを受けている人ほどやり取りの履歴があるので、いちばん困る人が抜け出せなかった。
//
// 【ごめんなさい（_dmBlocks）との違い】
//   ごめんなさい   … どんな関係でも送れない（ゴル友・同じ組でも）。★にも響く。
//   どっちでもいい … 「前にやり取りしたから」という理由だけを外す。
//                    ゴル友（QR・友達申請）・これから一緒に回る同じ組・申請/招待中など、
//                    **いま関係がある**なら送れる。★には響かない。
// 別のコレクションに置くのは、既存の遮断（isBlocked / blockedSetOf）の意味を変えないため。
const CLOSED = '_dmClosed';

/** 「どっちでもいい」を記録して、履歴だけを理由にしたDMを閉じる。 */
export async function closeDm(by: string, other: string, roundId?: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !by || !other || by === other) return;
  const id = blockId(by, other);
  try {
    await adb.collection(CLOSED).doc(id).set(
      { pairId: id, members: [by, other].sort(), by, at: Date.now(), ...(roundId ? { roundId } : {}) },
      { merge: true },
    );
  } catch (e) {
    console.error('[dmClosed] set failed', (e as Error).message);
  }
}

/** やわらかい遮断を解く。「また回りたい」を選び直したときに呼ぶ。 */
export async function reopenDm(a: string, b: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !a || !b) return;
  try { await adb.collection(CLOSED).doc(blockId(a, b)).delete(); }
  catch { /* もともと無ければそれでよい */ }
}

/** 誰が「どっちでもいい」にしたか。本人にだけ理由を出すために使う。無ければ null。 */
export async function closedBy(a: string, b: string): Promise<string | null> {
  const adb = getAdminDb() as any;
  if (!adb || !a || !b) return null;
  try {
    const s = await adb.collection(CLOSED).doc(blockId(a, b)).get();
    return s.exists ? (s.data()?.by || null) : null;
  } catch { return null; }
}

/** meId と「どっちでもいい」で閉じている相手の集合（一括判定用）。 */
export async function closedSetOf(meId: string): Promise<Set<string>> {
  const out = new Set<string>();
  const adb = getAdminDb() as any;
  if (!adb || !meId) return out;
  try {
    const snap = await adb.collection(CLOSED).where('members', 'array-contains', meId).limit(1000).get();
    snap.docs.forEach((d: any) => {
      const m: string[] = d.data()?.members || [];
      m.forEach((x) => { if (x && x !== meId) out.add(x); });
    });
  } catch { /* 引けなければ閉じていない扱い（従来どおり） */ }
  return out;
}
