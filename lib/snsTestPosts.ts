import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { registeredParticipantIds } from './groups';

// インスタ風テスト版の写真投稿（2026-11-01 本人指定「SNSみたいに写真をアップして並ぶように」「複数枚・文章・メンションも」・運営だけ）。
//   ・snsTestPosts/{id} に { uid, caption, roundId, mentions[], n, at }、写真は1枚ずつ snsTestPostPhotos/{id}_{i} に { data, at }（一覧を軽くする）。
//   ・本物のアルバム（rounds/{id}/photos）とタイムライン（timelinePosts）には書かない。
//   ・メンションされた人にも、誰にも通知しない（お知らせにも出さない）。テスト版の中で名前がリンクになるだけ。
const POSTS = 'snsTestPosts';
const PHOTOS = 'snsTestPostPhotos';
const MAX_PHOTOS = 10;
const MAX_BYTES = 900_000;   // Firestore の1件1MBに収める

const adb = () => getAdminDb() as any;

export type TestPost = { id: string; uid: string; caption: string; roundId: string; mentions: string[]; n: number; at: number; photos: string[] };

const toPost = (d: any): TestPost => {
  const x = d.data() || {};
  const n = Number(x.n) || 0;
  return {
    id: d.id, uid: x.uid || '', caption: x.caption || '', roundId: x.roundId || '', mentions: Array.isArray(x.mentions) ? x.mentions : [], n, at: x.at || 0,
    photos: Array.from({ length: n }, (_, i) => `/api/sns/post/${encodeURIComponent(d.id)}/photo?i=${i}`),
  };
};

/** 新しい順。uid を渡すとその人の投稿だけ */
export async function listPosts(uid?: string): Promise<TestPost[]> {
  if (!adb()) return [];
  const col = adb().collection(POSTS);
  const snap = await (uid ? col.where('uid', '==', uid) : col).limit(300).get().catch(() => ({ docs: [] }));
  return snap.docs.map(toPost).sort((a: TestPost, b: TestPost) => b.at - a.at);
}

/** mentions は呼び出し側で「メンションできる人」に絞ってから渡す */
export async function createPost(meId: string, body: any, mentions: string[]): Promise<string> {
  const photos: string[] = Array.isArray(body?.photos) ? body.photos.map(String) : [];
  if (photos.length === 0) throw new Error('no_photo');
  if (photos.length > MAX_PHOTOS) throw new Error('too_many');
  for (const p of photos) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(p)) throw new Error('bad_photo');
    if (p.length > MAX_BYTES) throw new Error('too_large');
  }
  // ラウンドは「自分が参加したもの」だけ付けられる（無しでもよい）
  const roundId = String(body?.roundId || '');
  if (roundId) {
    const r = await db.getRound(roundId);
    if (!r || !(r.hostId === meId || registeredParticipantIds(r).includes(meId))) throw new Error('bad_round');
  }
  const now = Date.now();
  const ref = adb().collection(POSTS).doc();
  // 写真を先に置く（途中で失敗しても、写真の無い投稿が並ばない）
  await Promise.all(photos.map((data, i) => adb().collection(PHOTOS).doc(`${ref.id}_${i}`).set({ data, at: now })));
  await ref.set({ uid: meId, caption: String(body?.caption || '').trim().slice(0, 500), roundId, mentions, n: photos.length, at: now });
  return ref.id;
}

export async function postPhoto(id: string, i: number): Promise<string | null> {
  if (!adb() || !Number.isInteger(i) || i < 0 || i >= MAX_PHOTOS) return null;
  const sn = await adb().collection(PHOTOS).doc(`${id}_${i}`).get();
  return sn.exists ? (sn.data()?.data || null) : null;
}

/** 消せるのは投稿した本人だけ */
export async function deletePost(meId: string, id: string): Promise<boolean> {
  const ref = adb().collection(POSTS).doc(id);
  const sn = await ref.get();
  if (!sn.exists || sn.data()?.uid !== meId) return false;
  await Promise.all(Array.from({ length: MAX_PHOTOS }, (_, i) => adb().collection(PHOTOS).doc(`${id}_${i}`).delete().catch(() => {})));
  await ref.delete();
  return true;
}
