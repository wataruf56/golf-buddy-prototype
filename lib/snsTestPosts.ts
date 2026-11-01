import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { registeredParticipantIds } from './groups';
import { isPersona } from './snsTestTalk';

// インスタ風テスト版の写真投稿（2026-11-01 本人指定「SNSみたいに写真をアップして並ぶように」「複数枚・文章・メンションも」・運営だけ）。
//   ・snsTestPosts/{id} に { uid, caption, roundId, mentions[], n, at }、写真は1枚ずつ snsTestPostPhotos/{id}_{i} に { data, at }（一覧を軽くする）。
//   ・本物のアルバム（rounds/{id}/photos）とタイムライン（timelinePosts）には書かない。
//   ・メンションされた人にも、誰にも通知しない（お知らせにも出さない）。テスト版の中で名前がリンクになるだけ。
//   ・タグ付けの許可（2026-11-01 本人指定）：メンションされた人が1件ずつ許可すると tagApproved に入り、その人のプロフィールの「写真」と「タグ付け」タブに出る（来た人全員に見える）。
//     許可しなければ、投稿の中のタグは残るが、その人のプロフィールには出ない。
//   ・動画：videos[i] に置き場所（lib/snsTestMedia）、snsTestPostPhotos/{id}_{i} にはその表紙を入れる。videos は photos と同じ並び（写真の位置は ''）。
const POSTS = 'snsTestPosts';
const PHOTOS = 'snsTestPostPhotos';
const MAX_PHOTOS = 10;
const MAX_BYTES = 900_000;   // Firestore の1件1MBに収める

const adb = () => getAdminDb() as any;

export type TestPost = { id: string; uid: string; caption: string; roundId: string; mentions: string[]; n: number; at: number; photos: string[]; videos: string[]; tagApproved: string[] };

const toPost = async (d: any): Promise<TestPost> => {
  const x = d.data() || {};
  const n = Number(x.n) || 0;
  const objects: string[] = Array.isArray(x.videos) ? x.videos : [];
  const videos = objects.some(Boolean)
    ? await import('./snsTestMedia').then((m) => Promise.all(objects.map((o) => (o ? m.videoPlayUrl(o).catch(() => '') : ''))))
    : [];
  return {
    id: d.id, uid: x.uid || '', caption: x.caption || '', roundId: x.roundId || '', mentions: Array.isArray(x.mentions) ? x.mentions : [], n, at: x.at || 0,
    // sample はテスト用の人の見本（public の画像）
    photos: Array.isArray(x.sample) ? x.sample : Array.from({ length: n }, (_, i) => `/api/sns/post/${encodeURIComponent(d.id)}/photo?i=${i}`),
    videos, tagApproved: Array.isArray(x.tagApproved) ? x.tagApproved : [],
  };
};
const toPosts = async (snap: any): Promise<TestPost[]> => (await Promise.all(snap.docs.map(toPost)) as TestPost[]).sort((a, b) => b.at - a.at);

/** 新しい順。uid を渡すとその人の投稿だけ */
export async function listPosts(uid?: string): Promise<TestPost[]> {
  if (!adb()) return [];
  const col = adb().collection(POSTS);
  const snap = await (uid ? col.where('uid', '==', uid) : col).limit(300).get().catch(() => ({ docs: [] }));
  return toPosts(snap);
}

/** その人がメンションされている投稿（許可していないものも含む。出す範囲は呼び出し側で絞る） */
export async function listTagged(uid: string): Promise<TestPost[]> {
  if (!adb()) return [];
  const snap = await adb().collection(POSTS).where('mentions', 'array-contains', uid).limit(300).get().catch(() => ({ docs: [] }));
  return toPosts(snap);
}

/** 自分宛て用：テスト版では自分をタグ付けしてくれる人がいないので、テスト用の人の投稿を見本に置く（許可を試すため・本物の会員には関係しない） */
export async function listTaggedWithSamples(meId: string, myName: string): Promise<TestPost[]> {
  const list = await listTagged(meId);
  if (list.some((p) => isPersona(p.uid))) return list;
  const now = Date.now();
  const samples = [
    { uid: 'snsp_yuka', sample: ['/golmoti-chars/EWPT.png', '/golmoti-chars/GWPT.png'], caption: `この前はありがとうございました！またぜひ⛳ @${myName}` },
    { uid: 'snsp_kenji', sample: ['/golmoti-chars/EMKT.png'], caption: `@${myName} さんのナイスショットが忘れられない🏌️` },
  ];
  await Promise.all(samples.map((s, k) => adb().collection(POSTS).add({ ...s, roundId: '', mentions: [meId], n: s.sample.length, at: now - (k + 1) * 3600_000 })));
  return listTagged(meId);
}

/** メンションされた本人だけが、プロフィールに出す／出さないを決められる */
export async function setTagApproval(meId: string, id: string, on: boolean): Promise<boolean> {
  const ref = adb().collection(POSTS).doc(id);
  return adb().runTransaction(async (tx: any) => {
    const sn = await tx.get(ref);
    const x = sn.exists ? sn.data() || {} : null;
    if (!x || !(x.mentions || []).includes(meId)) return false;
    const rest = (x.tagApproved || []).filter((u: string) => u !== meId);
    tx.update(ref, { tagApproved: on ? [...rest, meId] : rest });
    return true;
  });
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
  // 動画は photos と同じ並び（表紙が photos に入っている）。自分が上げたものだけ付けられる
  const videos: string[] = Array.isArray(body?.videos) ? body.videos.slice(0, photos.length).map(String) : [];
  if (videos.some(Boolean)) {
    const { assertMyVideo } = await import('./snsTestMedia');
    await Promise.all(videos.filter(Boolean).map((o) => assertMyVideo(meId, 'p', o)));
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
  await ref.set({ uid: meId, caption: String(body?.caption || '').trim().slice(0, 500), roundId, mentions, n: photos.length, at: now, ...(videos.some(Boolean) ? { videos } : {}) });
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
  const objects: string[] = (sn.data()?.videos || []).filter(Boolean);
  if (objects.length) await import('./snsTestMedia').then((m) => Promise.all(objects.map(m.deleteVideo))).catch(() => {});
  await Promise.all(Array.from({ length: MAX_PHOTOS }, (_, i) => adb().collection(PHOTOS).doc(`${id}_${i}`).delete().catch(() => {})));
  await ref.delete();
  await import('./snsTestReactions').then((m) => m.deleteReactions(`t_${id}`)).catch(() => {});
  return true;
}
