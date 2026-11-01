import 'server-only';
import crypto from 'crypto';
import { db } from './db';
import { getAdminDb } from './firebase';
import { pub, type SnsUser } from './snsTest';

// インスタ風テスト版の、投稿へのいいね・コメント（2026-11-01 本人指定「写真をタップしたらそれのみ表示し、コメントやいいねができるように」・運営だけ）。
//   ・snsTestReactions/{key} に { likes: uid[], comments: [{ id, uid, text, at }] }。本物の通知・お知らせ・タイムラインには一切触れない。
//   ・key：t_<テスト版の投稿ID>／r_<ラウンドID>（ラウンドのアルバム）／o_<本人ID>_<ラウンドID>（本人が上げた写真）。
const COL = 'snsTestReactions';
const MAX_COMMENTS = 200;
const MAX_TEXT = 300;

const adb = () => getAdminDb() as any;
export const isReactionKey = (key: string) => /^[tro]_[^/]{1,300}$/.test(key);

type CommentDoc = { id: string; uid: string; text: string; at: number };
export type Reactions = { likes: number; liked: boolean; comments: { id: string; user: SnsUser; text: string; at: number; mine: boolean }[] };

async function toReactions(meId: string, x: any): Promise<Reactions> {
  const likes: string[] = x?.likes || [];
  const docs: CommentDoc[] = x?.comments || [];
  const users = docs.length ? await db.listUsers(Array.from(new Set(docs.map((c) => c.uid)))) : [];
  const byId = new Map(users.filter(Boolean).map((u) => [u.id, pub(u)]));
  return {
    likes: likes.length, liked: likes.includes(meId),
    comments: docs.flatMap((c) => { const user = byId.get(c.uid); return user ? [{ id: c.id, user, text: c.text, at: c.at, mine: c.uid === meId }] : []; }),
  };
}

export async function getReactions(meId: string, key: string): Promise<Reactions> {
  const sn = await adb().collection(COL).doc(key).get();
  return toReactions(meId, sn.exists ? sn.data() : null);
}

/** ホームに並べる分の数だけ（コメントの中身は開いたときに読む） */
export async function reactionCounts(meId: string, keys: string[]): Promise<Map<string, { likes: number; liked: boolean; comments: number }>> {
  const out = new Map<string, { likes: number; liked: boolean; comments: number }>();
  if (!keys.length) return out;
  const snaps = await adb().getAll(...keys.map((k) => adb().collection(COL).doc(k)));
  for (const sn of snaps) {
    if (!sn.exists) continue;
    const x = sn.data() || {};
    out.set(sn.id, { likes: (x.likes || []).length, liked: (x.likes || []).includes(meId), comments: (x.comments || []).length });
  }
  return out;
}

async function update(meId: string, key: string, change: (x: { likes: string[]; comments: CommentDoc[] }) => void): Promise<Reactions> {
  const ref = adb().collection(COL).doc(key);
  const next = await adb().runTransaction(async (tx: any) => {
    const sn = await tx.get(ref);
    const x = { likes: [...(sn.data()?.likes || [])], comments: [...(sn.data()?.comments || [])] };
    change(x);
    tx.set(ref, { ...x, at: Date.now() });
    return x;
  });
  return toReactions(meId, next);
}

export const setLike = (meId: string, key: string, on: boolean) => update(meId, key, (x) => {
  x.likes = x.likes.filter((u) => u !== meId);
  if (on) x.likes.push(meId);
});

export function addComment(meId: string, key: string, raw: unknown) {
  const text = String(raw || '').trim().slice(0, MAX_TEXT);
  if (!text) throw new Error('empty');
  return update(meId, key, (x) => {
    if (x.comments.length >= MAX_COMMENTS) throw new Error('too_many');
    x.comments.push({ id: crypto.randomBytes(6).toString('hex'), uid: meId, text, at: Date.now() });
  });
}

/** 消せるのは書いた本人だけ */
export const deleteComment = (meId: string, key: string, id: string) => update(meId, key, (x) => {
  x.comments = x.comments.filter((c) => !(c.id === id && c.uid === meId));
});

export async function deleteReactions(key: string): Promise<void> {
  await adb().collection(COL).doc(key).delete().catch(() => {});
}
