import 'server-only';
import { getAdminDb } from '@/lib/firebase';

// Instagram投稿の下書き／予約を保持する。
//
// コレクション:
//   igPosts   … 1件＝1投稿（下書き→予約→公開）
//   igImages  … roundId → 画像URL の対応表（画像は事前にGCSへ上げておく）
//
// 安全側の設計：
//   ・propose は draft しか作らない。勝手に公開しない。
//   ・publish は「人が公開を押す」か「人が予約した時刻が来る」かのどちらかでのみ走る。

export type IgPostStatus = 'draft' | 'scheduled' | 'published' | 'canceled' | 'failed';

export type IgPost = {
  id: string;
  roundId?: string;
  imageUrl: string;
  caption: string;
  status: IgPostStatus;
  /** 予約時刻（epoch ms）。status='scheduled' のときのみ意味を持つ。 */
  scheduledAt?: number | null;
  /** 同じ内容を二重に提案しないための指紋（roundId + 残枠 など）。 */
  signature?: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number | null;
  igMediaId?: string | null;
  error?: string | null;
};

const COL = 'igPosts';
const IMG = 'igImages';

function db(): any {
  const d = getAdminDb() as any;
  if (!d) throw new Error('firestore not initialized');
  return d;
}

function toPost(id: string, d: any): IgPost {
  return {
    id,
    roundId: d?.roundId || undefined,
    imageUrl: String(d?.imageUrl || ''),
    caption: String(d?.caption || ''),
    status: (d?.status || 'draft') as IgPostStatus,
    scheduledAt: typeof d?.scheduledAt === 'number' ? d.scheduledAt : null,
    signature: d?.signature || undefined,
    createdAt: Number(d?.createdAt || 0),
    updatedAt: Number(d?.updatedAt || 0),
    publishedAt: typeof d?.publishedAt === 'number' ? d.publishedAt : null,
    igMediaId: d?.igMediaId || null,
    error: d?.error || null,
  };
}

export async function listIgPosts(limit = 50): Promise<IgPost[]> {
  const snap = await db().collection(COL).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((s: any) => toPost(s.id, s.data()));
}

export async function getIgPost(id: string): Promise<IgPost | null> {
  const s = await db().collection(COL).doc(id).get();
  return s.exists ? toPost(s.id, s.data()) : null;
}

export async function createIgPost(input: {
  roundId?: string; imageUrl: string; caption: string; signature?: string;
}): Promise<IgPost> {
  const now = Date.now();
  const doc = {
    roundId: input.roundId || null,
    imageUrl: input.imageUrl,
    caption: input.caption,
    status: 'draft' as IgPostStatus,
    scheduledAt: null,
    signature: input.signature || null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    igMediaId: null,
    error: null,
  };
  const ref = await db().collection(COL).add(doc);
  return toPost(ref.id, doc);
}

export async function updateIgPost(id: string, patch: Partial<IgPost>): Promise<void> {
  const clean: any = { updatedAt: Date.now() };
  for (const k of ['caption', 'imageUrl', 'status', 'scheduledAt', 'publishedAt', 'igMediaId', 'error'] as const) {
    if (k in patch) clean[k] = (patch as any)[k];
  }
  await db().collection(COL).doc(id).set(clean, { merge: true });
}

/** 下書きを消す。公開済みは消さない（記録として残す）。 */
export async function deleteIgPost(id: string): Promise<void> {
  await db().collection(COL).doc(id).delete();
}

/** 同じ指紋の投稿が既にあるか（公開済み・予約済み・下書きすべて対象）。 */
export async function signatureExists(signature: string): Promise<boolean> {
  if (!signature) return false;
  const snap = await db().collection(COL).where('signature', '==', signature).limit(1).get();
  return !snap.empty;
}

/** 予約時刻を過ぎた scheduled を取得する。
 *
 * where + orderBy を組み合わせると Firestore の複合インデックスが要る。
 * 未作成だとクエリごと FAILED_PRECONDITION で落ち、予約投稿が丸ごと動かなくなる
 * （2026-08-07 の不具合はこれ）。予約は多くても数件なので、
 * 単一条件で引いてから並べ替えと絞り込みをメモリ上でやる。
 */
export async function listDueScheduled(now = Date.now()): Promise<IgPost[]> {
  const snap = await db().collection(COL).where('status', '==', 'scheduled').limit(50).get();
  return snap.docs
    .map((s: any) => toPost(s.id, s.data()))
    .filter((p: IgPost) => typeof p.scheduledAt === 'number' && (p.scheduledAt as number) <= now)
    .sort((a: IgPost, b: IgPost) => (a.scheduledAt as number) - (b.scheduledAt as number));
}

/** 予約中のものを全部返す（管理画面の見張り用）。 */
export async function listScheduled(): Promise<IgPost[]> {
  const snap = await db().collection(COL).where('status', '==', 'scheduled').limit(50).get();
  return snap.docs.map((s: any) => toPost(s.id, s.data()));
}

// ------------------------------------------------------------------ 死活監視
//
// 予約投稿のcronが黙って落ちていても誰も気づけなかったので、
// 毎回の実行結果をここに1件だけ書き、管理画面で見えるようにする。

const SYS = 'igSystem';
const SYS_DOC = 'publishDue';

export type CronState = { lastRunAt: number; lastOkAt: number | null; lastError: string | null };

export async function recordCronRun(error: string | null): Promise<void> {
  const now = Date.now();
  const patch: any = { lastRunAt: now, lastError: error };
  if (!error) patch.lastOkAt = now;
  await db().collection(SYS).doc(SYS_DOC).set(patch, { merge: true });
}

export async function getCronState(): Promise<CronState | null> {
  const s = await db().collection(SYS).doc(SYS_DOC).get();
  if (!s.exists) return null;
  const d = s.data() || {};
  return {
    lastRunAt: Number(d.lastRunAt || 0),
    lastOkAt: typeof d.lastOkAt === 'number' ? d.lastOkAt : null,
    lastError: d.lastError || null,
  };
}

// ------------------------------------------------------------------ 画像対応表
//
// 画像には日付と残り枠が焼き込まれている。ラウンドの内容が変わると
// 画像だけ古いまま残り、本文と食い違う（2026-08-07 の「1日ずれる」問題）。
// そこで、どの日付・どの残り枠で焼いたのかを一緒に控えておき、
// 提案時に突き合わせて、合わないものは投稿を作らないようにする。

export type RoundImage = {
  imageUrl: string;
  /** 画像に焼かれている日付（YYYY-MM-DD）。古い画像には無い。 */
  imageDate?: string | null;
  /** 画像に焼かれている残り枠。古い画像には無い。 */
  imageRest?: number | null;
};

export async function getRoundImage(roundId: string): Promise<RoundImage | null> {
  if (!roundId) return null;
  const s = await db().collection(IMG).doc(roundId).get();
  if (!s.exists) return null;
  const d = s.data() || {};
  if (!d.imageUrl) return null;
  return {
    imageUrl: String(d.imageUrl),
    imageDate: typeof d.imageDate === 'string' ? d.imageDate : null,
    imageRest: typeof d.imageRest === 'number' ? d.imageRest : null,
  };
}

export async function setRoundImage(
  roundId: string, imageUrl: string, meta?: { imageDate?: string; imageRest?: number },
): Promise<void> {
  const doc: any = { imageUrl, updatedAt: Date.now() };
  if (meta?.imageDate) doc.imageDate = meta.imageDate;
  if (typeof meta?.imageRest === 'number') doc.imageRest = meta.imageRest;
  await db().collection(IMG).doc(roundId).set(doc, { merge: true });
}

export async function listRoundImages(): Promise<{ roundId: string; imageUrl: string }[]> {
  const snap = await db().collection(IMG).limit(200).get();
  return snap.docs.map((s: any) => ({ roundId: s.id, imageUrl: s.data()?.imageUrl || '' }));
}
