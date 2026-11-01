import 'server-only';
import { getAdminDb } from './firebase';
import type { User } from './types';
import type { SnsUser } from './snsTest';

// インスタ風テスト版の「ひとこと」（24時間で消える文字のストーリー＋選べる答え）と、テスト版だけのDM（2026-11-01 本人指定）。
//   ・見られるのは運営だけ（lib/snsTest の snsAllowed）。ほかの会員には見えないので、反応してくれる相手として
//     「テスト用の人」（TEST_PERSONAS・名前に（テスト）付き・実在しない）を用意する。
//   ・書くのはテスト版専用の箱だけ：snsTestStories / snsTestThreads。既存の会員・DM・通知・LINEには一切触れない。
//   ・答えを押してくれた人には、フォローに関係なく投稿した人からDMを送れる（モックで決めたルール）。
//   ・テスト用の人のひとことに答えると、その人からDMが届く（テスト版の中だけ）。DMを送ると、テスト用の人が返事をする。
const STORIES = 'snsTestStories';
const PHOTOS = 'snsTestStoryPhotos';   // ひとことの写真（データURL）。ひとことの本体と分けて、一覧を軽くする
const THREADS = 'snsTestThreads';
const DAY = 24 * 60 * 60 * 1000;
export const STORY_BG = ['#2A8C82', '#E8643C', '#6B5BB5', '#1E2B27', '#C2477A'];

export const TEST_PERSONAS: SnsUser[] = [
  { id: 'snsp_yuka', name: 'ゆか（テスト）', avatar: '🐰', color: '#E8643C', gender: 'female', age: 28, area: '東京' },
  { id: 'snsp_kenji', name: 'けんじ（テスト）', avatar: '🐻', color: '#3E6FB0', gender: 'male', age: 32, area: '千葉', car: 'have' },
  { id: 'snsp_mio', name: 'みお（テスト）', avatar: '🐱', color: '#C48A12', gender: 'female', age: 29, area: '神奈川', car: 'have' },
  { id: 'snsp_ryo', name: 'りょう（テスト）', avatar: '🦊', color: '#6B5BB5', gender: 'male', age: 35, area: '埼玉', car: 'have' },
  { id: 'snsp_haruka', name: 'はるか（テスト）', avatar: '🐼', color: '#2F8FA8', gender: 'female', age: 27, area: '神奈川' },
  { id: 'snsp_saki', name: 'さき（テスト）', avatar: '🐥', color: '#C2477A', gender: 'female', age: 26, area: '東京' },
];
const personaOf = (id: string) => TEST_PERSONAS.find((p) => p.id === id);
export const isPersona = (id: string) => !!personaOf(id);

export type TextStoryDoc = {
  id: string; uid: string; text: string; bg: string; date: string; choices: string[]; scope: 'followers' | 'all';
  at: number; expiresAt: number; answers: Record<string, { c: number; at: number }>; views: Record<string, number>; hasPhoto?: boolean;
};
export type TextStory = {
  kind: 'text'; id: string; user: SnsUser; text: string; bg: string; date: string; dateLabel: string; choices: string[];
  counts: number[]; myAnswer: number | null; mine: boolean; views: number; answers: number; at: number; scope: 'followers' | 'all'; persona: boolean;
  photo: string;   // 背景の写真（/api/sns/story/<id>/photo）。無ければ ''
};

function jstDateLabel(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  const dt = new Date(`${d}T00:00:00Z`);
  return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}（${'日月火水木金土'[dt.getUTCDay()]}）`;
}
function jstAfterDays(n: number, dow?: number): string {
  const base = new Date(Date.now() + 9 * 3600 * 1000 + n * DAY);
  if (dow != null) while (base.getUTCDay() !== dow) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}
const adb = () => getAdminDb() as any;

function toStory(d: TextStoryDoc, meId: string, userOf: (id: string) => SnsUser | null): TextStory | null {
  const user = userOf(d.uid);
  if (!user) return null;
  const counts = d.choices.map((_, k) => Object.values(d.answers || {}).filter((a) => a.c === k).length);
  const mine = d.uid === meId;
  return {
    kind: 'text', id: d.id, user, text: d.text, bg: d.bg, date: d.date, dateLabel: jstDateLabel(d.date), choices: d.choices,
    counts, myAnswer: d.answers?.[meId]?.c ?? null, mine, views: Object.keys(d.views || {}).length, answers: Object.keys(d.answers || {}).length,
    at: d.at, scope: d.scope, persona: isPersona(d.uid), photo: d.hasPhoto ? `/api/sns/story/${d.id}/photo` : '',
  };
}

async function liveStories(): Promise<TextStoryDoc[]> {
  const db = adb();
  if (!db) return [];
  const snap = await db.collection(STORIES).where('expiresAt', '>', Date.now()).limit(200).get();
  return snap.docs.map((x: any) => ({ id: x.id, ...(x.data() || {}) } as TextStoryDoc));
}

/** テスト用の人のひとことが1つも無いときだけ、見本を2つ置く（答えて、DMが届く流れを試すため） */
async function seedPersonaStories(): Promise<void> {
  const db = adb();
  const now = Date.now();
  const samples = [
    { uid: 'snsp_yuka', bg: STORY_BG[1], date: jstAfterDays(3, 6), text: 'この日行きたいと思ってるんだけど、誰か行きたい人いる？🙋‍♀️\n千葉あたりで！', choices: ['行きたい', 'ピックアップしてくれるなら', '気になる'] },
    { uid: 'snsp_saki', bg: STORY_BG[2], date: '', text: '初心者だけど、一緒に回ってくれる人いますか？🥺', choices: ['いいよ！', '練習場からなら', '応援してる'] },
  ];
  for (const [k, s] of samples.entries()) {
    await db.collection(STORIES).add({
      ...s, scope: 'all', at: now - (k + 1) * 3600_000, expiresAt: now + DAY - (k + 1) * 3600_000,
      answers: { snsp_ryo: { c: 0, at: now - 3000_000 }, snsp_haruka: { c: 2, at: now - 2000_000 } },
      views: { snsp_ryo: now - 3100_000, snsp_haruka: now - 2100_000, snsp_kenji: now - 1500_000 },
    });
  }
}

/** ホームのストーリー用：自分のひとこと（古い順）→ テスト用の人のひとこと */
export async function textStoriesFor(me: User, mePub: SnsUser): Promise<TextStory[]> {
  let docs = await liveStories().catch(() => [] as TextStoryDoc[]);
  if (!docs.some((d) => isPersona(d.uid))) {
    await seedPersonaStories().catch(() => {});
    docs = await liveStories().catch(() => docs);
  }
  const userOf = (id: string) => (id === me.id ? mePub : personaOf(id) || null);
  const mine = docs.filter((d) => d.uid === me.id).sort((a, b) => a.at - b.at);
  const others = docs.filter((d) => isPersona(d.uid)).sort((a, b) => b.at - a.at);
  return [...mine, ...others].map((d) => toStory(d, me.id, userOf)).filter(Boolean) as TextStory[];
}

// 2026-11-01（本人指定）：基本は文字だけ。答え（選択肢）は「選択肢を追加」を押したときだけ。写真を載せると背景になり、文字と答えは写真の上に出る。
// 写真だけ（文字なし）でも載せられる。写真は端末で縮めたJPEGのデータURL（900KBまで）。
export async function createStory(meId: string, body: any): Promise<string> {
  const text = String(body?.text || '').trim().slice(0, 80);
  const photo = typeof body?.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(body.photo) && body.photo.length <= 900_000 ? body.photo : '';
  if (!text && !photo) throw new Error('empty');
  const choices = (Array.isArray(body?.choices) ? body.choices : []).map((c: unknown) => String(c || '').trim().slice(0, 16)).filter(Boolean).slice(0, 4);
  const bg = STORY_BG.includes(body?.bg) ? body.bg : STORY_BG[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || '')) ? String(body.date) : '';
  const now = Date.now();
  if (choices.length === 1) throw new Error('one_choice');
  const ref = await adb().collection(STORIES).add({
    uid: meId, text, bg, date, choices, scope: body?.scope === 'all' ? 'all' : 'followers', at: now, expiresAt: now + DAY, answers: {}, views: {}, hasPhoto: !!photo,
  });
  if (photo) await adb().collection(PHOTOS).doc(ref.id).set({ data: photo, at: now });
  return ref.id;
}

/** ひとことの写真（データURL）。無ければ null */
export async function storyPhoto(id: string): Promise<string | null> {
  const sn = await adb().collection(PHOTOS).doc(id).get();
  return sn.exists ? String(sn.data()?.data || '') || null : null;
}

async function getDoc(id: string): Promise<TextStoryDoc | null> {
  const sn = await adb().collection(STORIES).doc(id).get();
  return sn.exists ? ({ id: sn.id, ...(sn.data() || {}) } as TextStoryDoc) : null;
}

/** 自分のひとことの反応（見た人・答え）。名前はテスト用の人と自分だけ */
export async function storyDetail(me: User, mePub: SnsUser, id: string) {
  const d = await getDoc(id);
  if (!d || d.uid !== me.id) return null;
  const userOf = (uid: string) => (uid === me.id ? mePub : personaOf(uid) || { id: uid, name: '（不明）', avatar: '⛳', color: '' } as SnsUser);
  const threads = await adb().collection(THREADS).where('owner', '==', me.id).get().catch(() => ({ docs: [] }));
  const hasThread = new Set<string>(threads.docs.map((x: any) => x.data()?.other).filter(Boolean));
  return {
    story: toStory(d, me.id, userOf),
    answers: Object.entries(d.answers || {}).sort((a, b) => b[1].at - a[1].at).map(([uid, a]) => ({ user: userOf(uid), c: a.c, at: a.at, thread: hasThread.has(uid) })),
    views: Object.entries(d.views || {}).sort((a, b) => b[1] - a[1]).map(([uid, at]) => ({ user: userOf(uid), at, answer: d.answers?.[uid]?.c ?? null })),
  };
}

/** テスト用：自分のひとことに、テスト用の人の「見た・答えた」を入れる（1回で最大3人） */
export async function simulateReactions(meId: string, id: string): Promise<number> {
  const d = await getDoc(id);
  if (!d || d.uid !== meId) throw new Error('not_found');
  const fresh = TEST_PERSONAS.filter((p) => !(d.views || {})[p.id]).sort(() => Math.random() - 0.5).slice(0, 3);
  const now = Date.now();
  const patch: Record<string, unknown> = {};
  fresh.forEach((p, k) => {
    patch[`views.${p.id}`] = now - k * 60_000;
    if (d.choices.length && Math.random() < 0.75) patch[`answers.${p.id}`] = { c: Math.floor(Math.random() * d.choices.length), at: now - k * 60_000 };
  });
  if (Object.keys(patch).length) await adb().collection(STORIES).doc(id).update(patch);
  return fresh.length;
}

export async function deleteStory(meId: string, id: string): Promise<void> {
  const d = await getDoc(id);
  if (!d || d.uid !== meId) throw new Error('not_found');
  await adb().collection(STORIES).doc(id).delete();
  await adb().collection(PHOTOS).doc(id).delete().catch(() => {});
}

/** 見たことを残す（テスト用の人のひとことを自分が見たとき） */
export async function markViewed(meId: string, id: string): Promise<void> {
  const d = await getDoc(id);
  if (!d || d.uid === meId || d.views?.[meId]) return;
  await adb().collection(STORIES).doc(id).update({ [`views.${meId}`]: Date.now() });
}

/** テスト用の人のひとことに答える → その人からDMが届く（テスト版のDMの中だけ） */
export async function answerStory(me: User, id: string, c: number): Promise<{ counts: number[]; myAnswer: number }> {
  const d = await getDoc(id);
  if (!d || d.uid === me.id || !isPersona(d.uid)) throw new Error('not_found');
  if (!(c >= 0 && c < d.choices.length)) throw new Error('bad_choice');
  if (d.answers?.[me.id]) throw new Error('already');
  await adb().collection(STORIES).doc(id).update({ [`answers.${me.id}`]: { c, at: Date.now() }, [`views.${me.id}`]: d.views?.[me.id] || Date.now() });
  const p = personaOf(d.uid)!;
  const when = jstDateLabel(d.date);
  await appendMessages(me.id, p.id, [{ f: p.id, t: `回答ありがとう！${when ? `${when}、` : ''}よかったら一緒に行きましょう⛳` }], { ref: id, origin: 'story' }, true);
  const answers = { ...(d.answers || {}), [me.id]: { c, at: Date.now() } };
  return { counts: d.choices.map((_, k) => Object.values(answers).filter((a) => a.c === k).length), myAnswer: c };
}

// ---- テスト版だけのDM（snsTestThreads/{owner}__{other}） ----
type Msg = { f: string; t: string; at: number };
const threadId = (owner: string, other: string) => `${owner}__${other}`;
const REPLIES = ['ありがとうございます！ぜひお願いします🙌', '了解です！集合はどのあたりにしますか？', 'いいですね〜楽しみにしてます⛳', 'わかりました！また連絡しますね'];

async function appendMessages(owner: string, other: string, msgs: Array<{ f: string; t: string }>, meta: { ref?: string; origin?: string }, unread: boolean) {
  const ref = adb().collection(THREADS).doc(threadId(owner, other));
  const now = Date.now();
  await adb().runTransaction(async (tx: any) => {
    const sn = await tx.get(ref);
    const cur = sn.exists ? sn.data() || {} : {};
    const list: Msg[] = [...(cur.msgs || []), ...msgs.map((m, k) => ({ ...m, t: m.t.slice(0, 500), at: now + k * 1500 }))].slice(-200);
    tx.set(ref, {
      owner, other, msgs: list, updatedAt: now, unread,
      ...(meta.ref && !cur.ref ? { ref: meta.ref } : {}), ...(meta.origin && !cur.origin ? { origin: meta.origin } : {}),
    }, { merge: true });
  });
}

/** 自分のひとことに答えた人へ／テスト用の人へ、メッセージを送る。テスト用の人は返事をする */
export async function sendTestDm(meId: string, other: string, text: string, storyRef?: string): Promise<void> {
  const t = String(text || '').trim();
  if (!t) throw new Error('empty');
  if (!isPersona(other)) throw new Error('only_test_people');
  const sn = await adb().collection(THREADS).doc(threadId(meId, other)).get();
  const n = ((sn.exists ? sn.data()?.msgs : []) || []).filter((m: Msg) => m.f === other).length;
  await appendMessages(meId, other, [{ f: meId, t }, { f: other, t: REPLIES[n % REPLIES.length] }],
    storyRef ? { ref: storyRef, origin: 'story' } : {}, false);
}

export async function listThreads(meId: string) {
  const snap = await adb().collection(THREADS).where('owner', '==', meId).get();
  return snap.docs.map((x: any) => x.data() || {})
    .filter((t: any) => (t.msgs || []).length)
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((t: any) => ({ other: personaOf(t.other) || { id: t.other, name: '（不明）', avatar: '⛳', color: '' }, last: t.msgs[t.msgs.length - 1], unread: !!t.unread, origin: t.origin || '' }));
}

export async function unreadThreads(meId: string): Promise<number> {
  const snap = await adb().collection(THREADS).where('owner', '==', meId).get().catch(() => ({ docs: [] }));
  return snap.docs.filter((x: any) => x.data()?.unread).length;
}

export async function getThread(me: User, mePub: SnsUser, other: string) {
  const ref = adb().collection(THREADS).doc(threadId(me.id, other));
  const sn = await ref.get();
  const t = sn.exists ? sn.data() || {} : {};
  if (t.unread) await ref.update({ unread: false }).catch(() => {});
  const refId: string = t.ref || '';
  let quote: { poster: string; text: string; dateLabel: string; bg: string; answer: string } | null = null;
  if (refId) {
    const d = await getDoc(refId).catch(() => null);
    if (d) {
      const answerer = d.uid === me.id ? other : me.id;
      const a = d.answers?.[answerer];
      quote = {
        poster: d.uid === me.id ? 'あなた' : (personaOf(d.uid)?.name || ''), text: d.text, dateLabel: jstDateLabel(d.date), bg: d.bg,
        answer: a ? `${answerer === me.id ? 'あなた' : personaOf(answerer)?.name || ''}は「${d.choices[a.c]}」と回答` : '',
      };
    }
  }
  return { me: mePub, other: personaOf(other) || null, msgs: (t.msgs || []) as Msg[], quote, origin: t.origin || '' };
}
