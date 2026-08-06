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

/** 同じ指紋の投稿が既にあるか（公開済み・予約済み・下書きすべて対象）。 */
export async function signatureExists(signature: string): Promise<boolean> {
  if (!signature) return false;
  const snap = await db().collection(COL).where('signature', '==', signature).limit(1).get();
  return !snap.empty;
}

/** 予約時刻を過ぎた scheduled を取得する。 */
export async function listDueScheduled(now = Date.now()): Promise<IgPost[]> {
  const snap = await db().collection(COL)
    .where('status', '==', 'scheduled')
    .orderBy('scheduledAt', 'asc')
    .limit(20)
    .get();
  return snap.docs
    .map((s: any) => toPost(s.id, s.data()))
    .filter((p: IgPost) => typeof p.scheduledAt === 'number' && (p.scheduledAt as number) <= now);
}

// ------------------------------------------------------------------ 画像対応表
export async function getRoundImage(roundId: string): Promise<string | null> {
  if (!roundId) return null;
  const s = await db().collection(IMG).doc(roundId).get();
  return s.exists ? (s.data()?.imageUrl || null) : null;
}

export async function setRoundImage(roundId: string, imageUrl: string): Promise<void> {
  await db().collection(IMG).doc(roundId).set(
    { imageUrl, updatedAt: Date.now() }, { merge: true });
}

export async function listRoundImages(): Promise<{ roundId: string; imageUrl: string }[]> {
  const snap = await db().collection(IMG).limit(200).get();
  return snap.docs.map((s: any) => ({ roundId: s.id, imageUrl: s.data()?.imageUrl || '' }));
}
