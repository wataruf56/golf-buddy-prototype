import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { userCohort } from './ageGate';
import { registeredParticipantIds, isNoShow } from './groups';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import type { Round, User } from './types';

// インスタ風ホーム・プロフィールのテスト版（2026-10-31 本人指定）。
//   ・見られるのは運営（ADMIN_USER_IDS）だけ。リンクはどこにも置かない（/sns を直接開く）。
//   ・中身は今のゴルトモの会員・募集・写真を「読むだけ」。既存のデータは一切書き換えない。
//   ・フォローは snsTestFollows/{from}__{to}（{ from, to, on, at }）に別に置く。最初は「友達＝相互フォロー」として見せ、
//     テスト版で押したフォロー／解除だけをその上に重ねる（既存の友達・DMの範囲には影響しない）。
//   ・写真はラウンドのアルバム（rounds/{id}/photos）と、タイムラインの「今日の写真」（timelinePosts）。
// 年代は見る人と同じ年代だけ（いまのタイムラインと同じ）。テスト垢・停止中・運営アカウントは出さない。

const FOLLOWS = 'snsTestFollows';
const DAY = 24 * 60 * 60 * 1000;

export async function snsAllowed(meId: string | null | undefined): Promise<boolean> {
  if (!meId) return false;
  const { isAdminUserId } = await import('./adminAccess');
  return isAdminUserId(meId);
}

export type SnsUser = {
  id: string; name: string; avatar: string; avatarUrl?: string; avatarMode?: string; color: string; golmotiType?: string;
  gender?: string; age?: number; area?: string; car?: string;
};
const pub = (u: User): SnsUser => ({
  id: u.id, name: String(u.displayName || 'メンバー').slice(0, 20), avatar: u.avatar || '', avatarUrl: u.avatarUrl || '',
  avatarMode: u.avatarMode || '', color: u.color || '', golmotiType: u.golmotiType || '', gender: u.gender, age: u.age, area: u.area || '', car: u.car,
});

function jstToday(): string { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function dateLabel(d?: string): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '';
  const dt = new Date(`${d}T00:00:00+09:00`);
  return `${dt.getMonth() + 1}/${dt.getDate()}（${'日月火水木金土'[dt.getDay()]}）`;
}

type Ctx = {
  me: User; cohort: string; hidden: (id: string) => boolean;
  userOf: Map<string, User>; load: (ids: string[]) => Promise<void>;
};
async function context(me: User): Promise<Ctx> {
  const [banned, cfg] = await Promise.all([
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
  ]);
  const testIds = new Set<string>((cfg?.accounts || []).map((a: any) => a.id));
  const userOf = new Map<string, User>();
  const hidden = (id: string) => {
    if (!id || banned.has(id) || id.startsWith('test_') || testIds.has(id) || id === ADMIN_MANAGER_ID || id === 'system') return true;
    const u = userOf.get(id);
    return !!u && (!!(u as any).banned || !!(u as any).isSystem || userCohort(u) !== (userCohort(me) || 'a'));
  };
  const load = async (ids: string[]) => {
    const need = Array.from(new Set(ids.filter((id) => id && !userOf.has(id))));
    if (need.length) for (const u of await db.listUsers(need)) if (u) userOf.set(u.id, u);
  };
  userOf.set(me.id, me);
  return { me, cohort: userCohort(me) || 'a', hidden, userOf, load };
}

// ---- フォロー（テスト版だけの上書き） ----
type Override = { on: boolean; at: number };
async function myOverrides(meId: string): Promise<Map<string, Override>> {
  const adb = getAdminDb() as any;
  const out = new Map<string, Override>();
  if (!adb) return out;
  const snap = await adb.collection(FOLLOWS).where('from', '==', meId).limit(1000).get().catch(() => ({ docs: [] }));
  for (const d of snap.docs) { const x = d.data() || {}; if (x.to) out.set(x.to, { on: !!x.on, at: x.at || 0 }); }
  return out;
}
async function overridesTo(targetId: string): Promise<Map<string, Override>> {
  const adb = getAdminDb() as any;
  const out = new Map<string, Override>();
  if (!adb) return out;
  const snap = await adb.collection(FOLLOWS).where('to', '==', targetId).limit(1000).get().catch(() => ({ docs: [] }));
  for (const d of snap.docs) { const x = d.data() || {}; if (x.from) out.set(x.from, { on: !!x.on, at: x.at || 0 }); }
  return out;
}
/** その人がフォローしている人（友達＋テスト版のフォロー−解除） */
async function followingOf(u: User): Promise<Set<string>> {
  const s = new Set<string>((u.friendIds || []).filter(Boolean));
  for (const [to, o] of Array.from(await myOverrides(u.id))) { if (o.on) s.add(to); else s.delete(to); }
  return s;
}
/** その人をフォローしている人（友達＋テスト版のフォロー−解除） */
async function followersOf(u: User): Promise<Set<string>> {
  const s = new Set<string>((u.friendIds || []).filter(Boolean));
  for (const [from, o] of Array.from(await overridesTo(u.id))) { if (o.on) s.add(from); else s.delete(from); }
  return s;
}

export async function setFollow(meId: string, targetId: string, on: boolean): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !targetId || targetId === meId) return;
  await adb.collection(FOLLOWS).doc(`${meId}__${targetId}`).set({ from: meId, to: targetId, on, at: Date.now() });
}

// ---- 写真 ----
type Photo = { url: string; by: string; at: number };
async function albumPhotos(): Promise<Map<string, Photo[]>> {
  const adb = getAdminDb() as any;
  const out = new Map<string, Photo[]>();
  if (!adb) return out;
  const snap = await adb.collectionGroup('photos').select('uploadedBy', 'createdAt').limit(500).get().catch(() => ({ docs: [] }));
  for (const d of snap.docs) {
    const rid = d.ref.parent.parent?.id;
    if (!rid || d.ref.parent.parent?.parent?.id !== 'rounds') continue;
    const x = d.data() || {};
    const arr = out.get(rid) || [];
    arr.push({ url: `/api/sns/photo?r=${encodeURIComponent(rid)}&p=${encodeURIComponent(d.id)}`, by: x.uploadedBy || '', at: x.createdAt || 0 });
    out.set(rid, arr);
  }
  for (const arr of Array.from(out.values())) arr.sort((a, b) => a.at - b.at);
  return out;
}
type TPost = { id: string; userId: string; roundId: string; text: string; at: number; url: string };
async function timelinePosts(cohort: string): Promise<TPost[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  const snap = await adb.collection('timelinePosts').select('userId', 'roundId', 'text', 'createdAt', 'cohort', 'test').limit(300).get().catch(() => ({ docs: [] }));
  return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }))
    .filter((x: any) => !x.test && (!x.cohort || x.cohort === cohort) && x.createdAt)
    .map((x: any) => ({ id: x.id, userId: x.userId, roundId: x.roundId, text: x.text || '', at: x.createdAt, url: `/api/timeline/posts/${encodeURIComponent(x.id)}/image?v=${x.createdAt}` }));
}

// ---- 募集 ----
async function allRounds(): Promise<Round[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  const since = Date.now() - 180 * DAY;
  const snap = await adb.collection('rounds').where('createdAt', '>=', since).limit(1500).get().catch(() => ({ docs: [] }));
  return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })) as Round[];
}
const isPlainRound = (r: Round) => !(r as any).availDate && !(r as any).availTest && (r as any).visibility !== 'invite' && !(r as any).heldCancelledAt;
const isDone = (r: Round, today: string) => r.status === 'completed' || (!!r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.date < today);
const membersOf = (r: Round) => registeredParticipantIds(r).filter((id) => !isNoShow(r, id));
const roundTitle = (r: Round) => String(r.courseName || r.title || (r.eventType === 'drink' ? '飲み会' : 'ラウンド')).slice(0, 30);

export type FeedItem =
  | { kind: 'photo'; id: string; at: number; user: SnsUser; roundId: string; place: string; when: string; photos: string[]; caption: string; tagged: SnsUser[] }
  | { kind: 'played'; id: string; at: number; roundId: string; place: string; when: string; members: SnsUser[]; drink: boolean }
  | { kind: 'open'; id: string; at: number; roundId: string; host: SnsUser; title: string; when: string; area: string; left: number; joined: SnsUser[]; drink: boolean };

export type Story =
  | { kind: 'avail'; user: SnsUser; dates: { date: string; label: string; count: number }[] }
  | { kind: 'recent'; user: SnsUser; roundId: string; place: string; when: string; photos: string[]; with: SnsUser[] };

export async function buildHome(me: User): Promise<{ me: SnsUser; stories: Story[]; feed: FeedItem[] }> {
  const ctx = await context(me);
  const today = jstToday();
  const [rounds, photos, posts, following] = await Promise.all([allRounds(), albumPhotos(), timelinePosts(ctx.cohort), followingOf(me)]);
  const plain = rounds.filter(isPlainRound);
  const ids = new Set<string>();
  plain.forEach((r) => { ids.add(r.hostId); membersOf(r).forEach((id) => ids.add(id)); });
  posts.forEach((p) => ids.add(p.userId));
  photos.forEach((arr) => arr.forEach((p) => ids.add(p.by)));
  await ctx.load(Array.from(ids));
  const okUser = (id: string) => !ctx.hidden(id) && ctx.userOf.has(id);
  const P = (id: string) => pub(ctx.userOf.get(id)!);
  const roundCohortOk = (r: Round) => (r.hostCohort || (ctx.userOf.get(r.hostId) ? userCohort(ctx.userOf.get(r.hostId)!) : '')) === ctx.cohort || (r as any).isOfficial;

  const feed: FeedItem[] = [];
  const roundById = new Map(plain.map((r) => [r.id, r]));
  // 写真（アルバム）…募集ごとに1投稿（カルーセル）。投稿者は最初に上げた人
  for (const [rid, arr] of Array.from(photos)) {
    const r = roundById.get(rid);
    if (!r || !roundCohortOk(r)) continue;
    const by = arr.find((p) => okUser(p.by))?.by;
    if (!by) continue;
    const tagged = membersOf(r).filter((id) => id !== by && okUser(id)).map(P);
    feed.push({ kind: 'photo', id: `album_${rid}`, at: arr[arr.length - 1].at, user: P(by), roundId: rid, place: roundTitle(r), when: dateLabel(r.date), photos: arr.map((p) => p.url).slice(0, 10), caption: '', tagged });
  }
  // タイムラインの「今日の写真」
  for (const p of posts) {
    if (!okUser(p.userId)) continue;
    const r = roundById.get(p.roundId);
    const tagged = r ? membersOf(r).filter((id) => id !== p.userId && okUser(id)).map(P) : [];
    feed.push({ kind: 'photo', id: `post_${p.id}`, at: p.at, user: P(p.userId), roundId: p.roundId, place: r ? roundTitle(r) : '', when: r ? dateLabel(r.date) : '', photos: [p.url], caption: p.text, tagged });
  }
  // 写真の無い、終わったラウンド（直近60日）
  for (const r of plain) {
    if (!isDone(r, today) || photos.has(r.id) || !roundCohortOk(r)) continue;
    const at = r.date ? new Date(`${r.date}T18:00:00+09:00`).getTime() : (r.createdAt || 0);
    if (at < Date.now() - 60 * DAY) continue;
    const members = membersOf(r).filter(okUser).map(P);
    if (members.length < 2) continue;
    feed.push({ kind: 'played', id: `played_${r.id}`, at, roundId: r.id, place: roundTitle(r), when: dateLabel(r.date), members, drink: r.eventType === 'drink' });
  }
  feed.sort((a, b) => b.at - a.at);
  // 募集中（これからの日・open）を3件おきに差し込む。フォロー中の人が入っている募集を先に
  const open = plain.filter((r) => r.status === 'open' && !!r.date && r.date >= today && roundCohortOk(r) && r.hostId !== ADMIN_MANAGER_ID && okUser(r.hostId))
    .map((r) => {
      const joined = membersOf(r).filter((id) => id !== me.id && okUser(id));
      const left = Math.max(0, (r.maxSpots || 0) - (r.currentCount || membersOf(r).length));
      return { r, joined, left, score: joined.filter((id) => following.has(id)).length };
    })
    .sort((a, b) => b.score - a.score || String(a.r.date).localeCompare(String(b.r.date)))
    .slice(0, 12)
    .map(({ r, joined, left }) => ({ kind: 'open' as const, id: `open_${r.id}`, at: r.createdAt || 0, roundId: r.id, host: P(r.hostId), title: String(r.title || roundTitle(r)).slice(0, 40), when: `${dateLabel(r.date)}${r.startTime ? ` ${r.startTime}` : ''}`, area: r.area || '', left, joined: joined.map(P), drink: r.eventType === 'drink' }));
  const mixed: FeedItem[] = [];
  let oi = 0;
  feed.forEach((it, i) => { mixed.push(it); if (i % 3 === 1 && oi < open.length) mixed.push(open[oi++]); });
  while (oi < open.length && mixed.length < 6) mixed.push(open[oi++]);

  // ストーリー：① 行ける日（フォロー中の人を先に） ② 最近ラウンドした人（7日以内）
  const stories: Story[] = [];
  const { listAvailabilityFor } = await import('./availability');
  const av = await listAvailabilityFor(me).catch(() => null);
  const byPerson = new Map<string, string[]>();
  const countByDate: Record<string, number> = {};
  for (const [date, list] of Object.entries(av?.byDate || {})) {
    countByDate[date] = list.length;
    for (const p of list as any[]) if (p.id && p.id !== me.id) byPerson.set(p.id, [...(byPerson.get(p.id) || []), date]);
  }
  await ctx.load(Array.from(byPerson.keys()));
  const availStories = Array.from(byPerson.entries()).filter(([id]) => okUser(id))
    .map(([id, dates]) => ({ kind: 'avail' as const, user: P(id), dates: dates.sort().slice(0, 6).map((d) => ({ date: d, label: dateLabel(d), count: countByDate[d] || 0 })) }))
    .sort((a, b) => Number(following.has(b.user.id)) - Number(following.has(a.user.id)) || a.dates[0].date.localeCompare(b.dates[0].date));
  const weekAgo = new Date(Date.now() + 9 * 3600 * 1000 - 7 * DAY).toISOString().slice(0, 10);
  const recentSeen = new Set<string>();
  const recentStories: Story[] = [];
  for (const r of plain.filter((x) => isDone(x, today) && !!x.date && x.date >= weekAgo && roundCohortOk(x)).sort((a, b) => String(b.date).localeCompare(String(a.date)))) {
    const mem = membersOf(r).filter(okUser);
    for (const id of mem) {
      if (recentSeen.has(id) || id === me.id) continue;
      recentSeen.add(id);
      recentStories.push({ kind: 'recent', user: P(id), roundId: r.id, place: roundTitle(r), when: dateLabel(r.date), photos: (photos.get(r.id) || []).map((p) => p.url).slice(0, 6), with: mem.filter((x) => x !== id).map(P) });
    }
  }
  stories.push(...recentStories.slice(0, 15), ...availStories.slice(0, 30));
  return { me: pub(me), stories, feed: mixed.slice(0, 60) };
}

export type ProfileTile = { roundId: string; photo?: string; place: string; when: string; drink: boolean; count: number };
export async function buildProfile(me: User, targetId: string) {
  const ctx = await context(me);
  await ctx.load([targetId]);
  const u = ctx.userOf.get(targetId);
  if (!u || (targetId !== me.id && ctx.hidden(targetId))) return null;
  const today = jstToday();
  const [rounds, photos, posts, followers, following, myFollowing] = await Promise.all([
    allRounds(), albumPhotos(), timelinePosts(ctx.cohort), followersOf(u), followingOf(u), followingOf(me),
  ]);
  const mine = rounds.filter(isPlainRound).filter((r) => membersOf(r).includes(targetId));
  const done = mine.filter((r) => isDone(r, today)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const upcoming = mine.filter((r) => !isDone(r, today) && r.status !== 'completed' && !!r.date && r.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const postByRound = new Map(posts.filter((p) => p.userId === targetId).map((p) => [p.roundId, p.url]));
  const tiles: ProfileTile[] = done.map((r) => ({
    roundId: r.id, photo: postByRound.get(r.id) || (photos.get(r.id) || [])[0]?.url, place: roundTitle(r), when: dateLabel(r.date), drink: r.eventType === 'drink', count: (photos.get(r.id) || []).length,
  }));
  // 一緒に回った人（回数順）
  const buddyCount = new Map<string, number>();
  for (const r of done) for (const id of membersOf(r)) if (id !== targetId) buddyCount.set(id, (buddyCount.get(id) || 0) + 1);
  await ctx.load([...Array.from(buddyCount.keys()), ...Array.from(followers), ...Array.from(following)]);
  const okUser = (id: string) => !ctx.hidden(id) && ctx.userOf.has(id);
  const buddies = Array.from(buddyCount.entries()).filter(([id]) => okUser(id)).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ user: pub(ctx.userOf.get(id)!), n }));
  const known = Array.from(followers).filter((id) => myFollowing.has(id) && id !== me.id && okUser(id)).map((id) => ctx.userOf.get(id)!.displayName || 'メンバー');
  const iFollow = myFollowing.has(targetId);
  const followsMe = targetId !== me.id && (await followingOf(u)).has(me.id);
  const { getGolmotiType } = await import('./golmoti');
  return {
    user: { ...pub(u), bio: String(u.bio || '').slice(0, 300), scoreRange: u.scoreRange || '', playStyle: u.playStyle || '', golfHistory: u.golfHistory || '', golmotiName: getGolmotiType(u.golmotiType)?.name || '' },
    isMe: targetId === me.id,
    stats: { rounds: done.length, followers: Array.from(followers).filter(okUser).length, following: Array.from(following).filter(okUser).length },
    iFollow, followsMe, mutual: iFollow && followsMe,
    known: known.slice(0, 2), knownMore: Math.max(0, known.length - 2),
    tiles,
    upcoming: upcoming.slice(0, 10).map((r) => ({ roundId: r.id, title: String(r.title || roundTitle(r)).slice(0, 40), when: `${dateLabel(r.date)}${r.startTime ? ` ${r.startTime}` : ''}`, area: r.area || '', host: r.hostId === targetId })),
    buddies: buddies.slice(0, 40),
  };
}
