import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort, type Cohort, viewCohort, userCohort, userViewCohort } from './ageGate';
import type { User } from './types';
import { clampCarNum, type AvailPerson } from './availabilityShared';
export type { AvailPerson } from './availabilityShared';

// 「行ける日」。会員が3か月先までのカレンダーから、行ける日を選んで置いておく。
//
// 【何を解いているか】
// 運営が代理で立てる募集（駅から相乗り）は、声かけを見た21人のうち登録が1人だった。
// 「枠を立てる」より手前の「いつ行けるか」を先に集めれば、運営が日付ごとに
// 人をまとめてコースを押さえられる。人を集めるのは運営、会員は日付を押すだけ。
//
// 【見せ方の約束（本人判断・2026-09-26）】
//   ・20〜30代（cohort a）の会員にだけ出す。並ぶのも同じ年代だけ。それ以外には機能自体を見せない
//   ・男性も女性も同じ一覧（名前・写真・年齢・性別・車）が見え、札からプロフィールを開ける
//     （2026-10-14 本人判断：以前は男性には年齢・性別・車だけで名前もIDも渡さなかったが、女性と同じく全部見せる）
//   ・車あり／なしはプロフィールの値。この画面で変えるとプロフィールも変わる
//   ・過ぎた日は自動で消える。3か月より先は選べない
//
// 保存先：_availability/{userId} = { dates: ['YYYY-MM-DD'...], addedAt?: { 'YYYY-MM-DD': ms }, seats?, bags?, updatedAt }
//   addedAt … その日を押した時刻（2026-10-14〜）。下のタブ「行ける日」の①②バッジ（countNewAvailFor）で
//              「見たあとに誰かが押した日」を数えるのに使う。これより前のドキュメントには無い（updatedAt で代用）
// 車はプロフィール（users.car）が正。ここには持たない（二重管理を避ける）。
// 乗れる人数（seats・運転手込み）とバッグの数（bags）は車を出せる人だけの値で、ここに持つ（2〜8）。
// 「行ける日」を出せるのは最寄り駅を登録した人だけ（API 側で弾く：lib/availabilityShared.needsStation）。

const COLL = '_availability';
export const WINDOW_DAYS = 92;   // 今日から約3か月

export type AvailabilityDoc = { userId: string; dates: string[]; addedAt?: Record<string, number>; seats?: number; bags?: number; updatedAt: number };

/** JST の今日 'YYYY-MM-DD' */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
export function windowEndJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
}
const isIsoDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 保存してよい日付だけに整える（過去・3か月より先・壊れた値を落とし、重複を除く）。 */
export function normalizeDates(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const lo = todayJst(); const hi = windowEndJst();
  return Array.from(new Set(input.filter(isIsoDate).filter((d) => d >= lo && d <= hi))).sort().slice(0, 120);
}

export async function getAvailability(userId: string): Promise<AvailabilityDoc | null> {
  const adb = getAdminDb() as any;
  if (!adb || !userId) return null;
  try {
    const s = await adb.collection(COLL).doc(userId).get();
    if (!s.exists) return null;
    const d = s.data() || {};
    // 読むときにも過去を落とす（保存時に落としても、日は進む）
    const seats = clampCarNum(d.seats); const bags = clampCarNum(d.bags);
    const addedAt = d.addedAt && typeof d.addedAt === 'object' ? d.addedAt as Record<string, number> : undefined;
    return { userId, dates: normalizeDates(d.dates), ...(addedAt ? { addedAt } : {}), ...(seats ? { seats } : {}), ...(bags ? { bags } : {}), updatedAt: d.updatedAt || 0 };
  } catch { return null; }
}

/**
 * 保存。seats / bags は undefined＝触らない、null や 2〜8 の外＝消す、数字＝入れる。
 * 返すのは保存後の状態（触らなかった値は existing から引き継ぐ）。
 */
export async function saveAvailability(
  userId: string, dates: string[], car?: { seats?: number | null; bags?: number | null },
): Promise<AvailabilityDoc> {
  const adb = getAdminDb() as any;
  const existing = await getAvailability(userId);
  const now = Date.now();
  const nextDates = normalizeDates(dates);
  // 日付ごとの「押した時刻」。前から入っていた日は前の時刻のまま（古いドキュメントは updatedAt）、新しく押した日だけ今。
  // 外した日・過ぎた日は落とす（mergeFields で addedAt ごと置き換えるので、消した日が残らない）
  const prevAdded = existing?.addedAt || {};
  const prevDates = new Set(existing?.dates || []);
  const addedAt: Record<string, number> = {};
  for (const d of nextDates) addedAt[d] = Number(prevAdded[d]) || (prevDates.has(d) ? (existing?.updatedAt || now) : now);
  const write: Record<string, unknown> = { userId, dates: nextDates, addedAt, updatedAt: now };
  if (car && car.seats !== undefined) write.seats = clampCarNum(car.seats) ?? null;
  if (car && car.bags !== undefined) write.bags = clampCarNum(car.bags) ?? null;
  if (adb && userId) await adb.collection(COLL).doc(userId).set(write, { mergeFields: Object.keys(write) });
  const seats = car && car.seats !== undefined ? clampCarNum(car.seats) : existing?.seats;
  const bags = car && car.bags !== undefined ? clampCarNum(car.bags) : existing?.bags;
  return { userId, dates: nextDates, addedAt, ...(seats ? { seats } : {}), ...(bags ? { bags } : {}), updatedAt: now };
}

/**
 * 「行ける日」で 🤝 の印を付ける友達（2026-10-11。2026-10-14 からは名前は誰にでも出るので、印と「声をかける」の相手を決めるだけ）。
 * ゴル友（QR・友達申請の承認＝User.friendIds）と、レビューでお互いに「行きたい／回ってみたい」を選んだ相手（マッチ）。
 * 主催者からの取りやめ連絡・申請中のやり取りなど、DMだけできる関係は入れない。「ごめんなさい」で遮断したペアは外す。
 */
export async function availFriendSet(viewer: Pick<User, 'id' | 'friendIds'>): Promise<Set<string>> {
  const out = new Set<string>((viewer.friendIds || []).filter(Boolean));
  try { const { mutualMatchSet } = await import('./matchPairs'); (await mutualMatchSet(viewer.id)).forEach((id) => out.add(id)); } catch { /* noop */ }
  try { const { blockedSetOf } = await import('./dmBlock'); (await blockedSetOf(viewer.id)).forEach((id) => out.delete(id)); } catch { /* noop */ }
  out.delete(viewer.id);
  return out;
}

/**
 * 日付ごとの「行ける人」。viewer と同じ年代（cohort）の会員だけを集める。
 * 名前・写真・IDは誰が見ても付ける（2026-10-14〜。以前は女性の閲覧者と友達だけだった）。友達（availFriendSet）には friend:true を立てる。
 * テスト用アカウントは、閲覧者がテストでなければ外す（bootstrap と同じ考え方）。
 */
export async function listAvailabilityFor(viewer: User): Promise<{
  cohort: Cohort | null; byDate: Record<string, AvailPerson[]>; mine: string[];
  /** 自分の車の設定（乗れる人数・バッグ数）。未設定なら undefined */
  mineCar: { seats?: number; bags?: number };
}> {
  const cohort = userViewCohort(viewer);   // 年齢未入力でも20〜30代として見られる（2026-10-08）
  const empty = { cohort, byDate: {} as Record<string, AvailPerson[]>, mine: [] as string[], mineCar: {} };
  if (cohort !== 'a') return empty;   // 20〜30代だけ。それ以外には機能自体を出さない
  const adb = getAdminDb() as any;
  if (!adb) return empty;

  const lo = todayJst();
  const [snap, users, banned, testCfg, friends] = await Promise.all([
    adb.collection(COLL).where('updatedAt', '>', 0).limit(2000).get(),
    adb.collection('users').limit(3000).get(),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
    availFriendSet(viewer).catch(() => new Set<string>()),
  ]);
  const userOf: Record<string, any> = {};
  users.docs.forEach((d: any) => { userOf[d.id] = { id: d.id, ...(d.data() || {}) }; });

  const tset = new Set((testCfg?.accounts || []).map((a: any) => a.id));
  const isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
  const viewerIsTest = isTestId(viewer.id);
  const hideTest = !!testCfg?.hideFromGeneral && !viewerIsTest;

  const byDate: Record<string, AvailPerson[]> = {};
  let mine: string[] = [];
  let mineCar: { seats?: number; bags?: number } = {};
  snap.docs.forEach((d: any) => {
    const x = d.data() || {};
    const uid: string = x.userId || d.id;
    const u = userOf[uid];
    if (!u) return;
    if (uid === viewer.id) {
      mine = normalizeDates(x.dates);
      const s = clampCarNum(x.seats); const b = clampCarNum(x.bags);
      mineCar = { ...(s ? { seats: s } : {}), ...(b ? { bags: b } : {}) };
    }
    if (banned.has(uid) || u.banned) return;
    if (hideTest && isTestId(uid)) return;
    if (userCohort(u) !== 'a') return;                         // 同じ年代だけ
    if (u.gender !== 'male' && u.gender !== 'female') return;      // 性別未設定は並べられない（青/ピンクで出すため）
    const dates: string[] = normalizeDates(x.dates).filter((dt) => dt >= lo);
    if (!dates.length) return;
    const isFriend = friends.has(uid);
    const person: AvailPerson = { age: u.age, gender: u.gender, car: u.car === 'have', ...(uid === viewer.id ? { me: true } : {}), ...(isFriend ? { friend: true } : {}) };
    if (person.car) {
      // 乗れる人数・バッグ数は車を出せる人だけ。誰が見ても出す（名前とは別の、車の情報）
      const s = clampCarNum(x.seats); const b = clampCarNum(x.bags);
      if (s) person.seats = s; if (b) person.bags = b;
    }
    // 名前とプロフィールは誰が見ても出す（2026-10-14 本人判断：男性にも女性と同じく全部見せる）
    Object.assign(person, {
      id: uid, name: u.displayName || 'メンバー', avatar: u.avatar || '', avatarUrl: u.avatarUrl || '',
      avatarMode: u.avatarMode || '', color: u.color || '', golmotiType: u.golmotiType || '',
    });
    for (const dt of dates) (byDate[dt] = byDate[dt] || []).push(person);
  });
  // 日付の中は 女性→男性、若い順。見たときに並びが毎回変わらないように。
  for (const dt of Object.keys(byDate)) {
    byDate[dt].sort((a, b) => (a.gender === b.gender ? a.age - b.age : a.gender === 'female' ? -1 : 1));
  }
  return { cohort, byDate, mine, mineCar };
}

/** 運営向け：日付ごとに、誰が行けるか（名前・年齢・性別・車・エリア・最寄り駅）。テスト垢は除く。 */
export async function listAvailabilityForAdmin(opts?: { includeTest?: boolean }): Promise<{
  byDate: Record<string, Array<{ id: string; name: string; age: number; gender: string; car: string; seats?: number; bags?: number; area: string; nearestStation: string; avatarUrl: string; updatedAt: number }>>;
  people: number;
}> {
  const adb = getAdminDb() as any;
  if (!adb) return { byDate: {}, people: 0 };
  const lo = todayJst();
  const [snap, users, testCfg] = await Promise.all([
    adb.collection(COLL).where('updatedAt', '>', 0).limit(2000).get(),
    adb.collection('users').limit(3000).get(),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
  ]);
  const userOf: Record<string, any> = {};
  users.docs.forEach((d: any) => { userOf[d.id] = { id: d.id, ...(d.data() || {}) }; });
  const tset = new Set((testCfg?.accounts || []).map((a: any) => a.id));
  const isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
  const byDate: Record<string, any[]> = {};
  const people = new Set<string>();
  snap.docs.forEach((d: any) => {
    const x = d.data() || {};
    const uid: string = x.userId || d.id;
    const u = userOf[uid];
    if (!u || u.banned) return;
    if (!opts?.includeTest && isTestId(uid)) return;
    if (userCohort(u) !== 'a') return;
    const dates = normalizeDates(x.dates).filter((dt) => dt >= lo);
    if (!dates.length) return;
    people.add(uid);
    const seats = clampCarNum(x.seats); const bags = clampCarNum(x.bags);
    const row = {
      id: uid, name: u.displayName || 'メンバー', age: u.age || 0, gender: u.gender || '', car: u.car || '',
      ...(u.car === 'have' && seats ? { seats } : {}), ...(u.car === 'have' && bags ? { bags } : {}),
      area: u.area || '', nearestStation: u.nearestStation || '', avatarUrl: u.avatarUrl || '', updatedAt: x.updatedAt || 0,
    };
    for (const dt of dates) (byDate[dt] = byDate[dt] || []).push(row);
  });
  for (const dt of Object.keys(byDate)) byDate[dt].sort((a, b) => (a.gender === b.gender ? a.age - b.age : a.gender === 'female' ? -1 : 1));
  return { byDate, people: people.size };
}

/**
 * 下のタブ「行ける日」の①②バッジ（2026-10-14）。
 * 見ている人が最後にタブを開いた時刻（users.availSeenAt）より後に、**ほかの人が**新しく押した日を数える。
 *   ・1件＝（人, 日付）の組。同じ人が3日押せば3。外した日・過ぎた日は数えない
 *   ・押した時刻は addedAt[日付]。古いドキュメント（addedAt なし）は updatedAt で代用
 *   ・数えるのは一覧に並ぶ人と同じ（同じ年代・性別あり・停止中でない）。テスト垢は、見ている人がテストのときだけ
 *   ・一度も開いていない人は直近7日、長く開いていない人も直近30日までしかさかのぼらない（読み取りを抑える）
 * 返す ats は数えた分の押した時刻（新しい順・最大120）。端末側の「ここまで見た」と比べ直せるように（サーバーへの記録が失敗したときの予備）。
 */
const newAvailCache = new Map<string, { at: number; v: { count: number; ats: number[] } }>();
export async function countNewAvailFor(viewer: User): Promise<{ count: number; ats: number[] }> {
  const none = { count: 0, ats: [] as number[] };
  if (userViewCohort(viewer) !== 'a') return none;   // 20〜30代だけの機能
  const adb = getAdminDb() as any;
  if (!adb) return none;
  const now = Date.now();
  const seenRaw = Number((viewer as any).availSeenAt) || 0;
  // さかのぼりの下限は10分単位に丸める（毎回ずれると下のキャッシュが効かない）
  const floorTo = (ms: number) => Math.floor(ms / 600000) * 600000;
  const since = Math.max(seenRaw || floorTo(now - 7 * 86400000), floorTo(now - 30 * 86400000));
  // 画面を移るたびに bootstrap が走るので、同じ人・同じ既読時刻なら1分は前の答えを使う
  const key = `${viewer.id}:${since}`;
  const hit = newAvailCache.get(key);
  if (hit && now - hit.at < 60_000) return hit.v;

  const snap = await adb.collection(COLL).where('updatedAt', '>', since).limit(500).get();
  const docs = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) })).filter((x: any) => (x.userId || x.id) !== viewer.id);
  if (!docs.length) { newAvailCache.set(key, { at: now, v: none }); return none; }

  const ids: string[] = Array.from(new Set(docs.map((x: any) => String(x.userId || x.id))));
  const [banned, testCfg] = await Promise.all([
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
  ]);
  const userOf: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => adb.collection('users').doc(id));
    const snaps = refs.length ? await adb.getAll(...refs) : [];
    for (const s of snaps) if (s.exists) userOf[s.id] = s.data() || {};
  }
  const tset = new Set((testCfg?.accounts || []).map((a: any) => a.id));
  const isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
  const viewerIsTest = isTestId(viewer.id);
  const lo = todayJst();

  const ats: number[] = [];
  for (const x of docs as any[]) {
    const uid = String(x.userId || x.id);
    const u = userOf[uid];
    if (!u || u.banned || banned.has(uid)) continue;
    if (!viewerIsTest && isTestId(uid)) continue;
    if (userCohort(u) !== 'a') continue;
    if (u.gender !== 'male' && u.gender !== 'female') continue;
    const added = x.addedAt && typeof x.addedAt === 'object' ? x.addedAt : {};
    for (const dt of normalizeDates(x.dates)) {
      if (dt < lo) continue;
      const t = Number(added[dt]) || Number(x.updatedAt) || 0;
      if (t > since) ats.push(t);
    }
  }
  ats.sort((a, b) => b - a);
  const v = { count: ats.length, ats: ats.slice(0, 120) };
  newAvailCache.set(key, { at: now, v });
  if (newAvailCache.size > 2000) newAvailCache.clear();
  return v;
}
