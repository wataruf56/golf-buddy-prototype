import 'server-only';
import { getAdminDb } from './firebase';
import { getCohort, type Cohort } from './ageGate';
import type { User } from './types';

// 「行ける日」。会員が3か月先までのカレンダーから、行ける日を選んで置いておく。
//
// 【何を解いているか】
// 運営が代理で立てる募集（駅から相乗り）は、声かけを見た21人のうち登録が1人だった。
// 「枠を立てる」より手前の「いつ行けるか」を先に集めれば、運営が日付ごとに
// 人をまとめてコースを押さえられる。人を集めるのは運営、会員は日付を押すだけ。
//
// 【見せ方の約束（本人判断・2026-09-26）】
//   ・20〜30代（cohort a）の会員にだけ出す。並ぶのも同じ年代だけ。それ以外には機能自体を見せない
//   ・男性も女性も同じ一覧（年齢・性別・車）が見える。違うのは**プロフィールを開けるか**だけ：
//     女性は名前とプロフィールへ、男性は年齢・性別・車だけ（名前もIDも渡さない）
//   ・車あり／なしはプロフィールの値。この画面で変えるとプロフィールも変わる
//   ・過ぎた日は自動で消える。3か月より先は選べない
//
// 保存先：_availability/{userId} = { dates: ['YYYY-MM-DD'...], updatedAt }
// 車はプロフィール（users.car）が正。ここには持たない（二重管理を避ける）。

const COLL = '_availability';
export const WINDOW_DAYS = 92;   // 今日から約3か月

export type AvailabilityDoc = { userId: string; dates: string[]; updatedAt: number };

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
    return { userId, dates: normalizeDates(d.dates), updatedAt: d.updatedAt || 0 };
  } catch { return null; }
}

export async function saveAvailability(userId: string, dates: string[]): Promise<AvailabilityDoc> {
  const adb = getAdminDb() as any;
  const doc = { userId, dates: normalizeDates(dates), updatedAt: Date.now() };
  if (adb && userId) await adb.collection(COLL).doc(userId).set(doc, { merge: true });
  return doc;
}

/** 一覧に載せる1人ぶん。誰に見せるかで、名前を付けるか付けないかが変わる。 */
export type AvailPerson = {
  age: number; gender: 'male' | 'female'; car: boolean;
  me?: boolean;
  // 女性が見るときだけ
  id?: string; name?: string; avatar?: string; avatarUrl?: string; avatarMode?: string; color?: string; golmotiType?: string;
};

/**
 * 日付ごとの「行ける人」。viewer と同じ年代（cohort）の会員だけを集める。
 * 名前とIDは女性の閲覧者にだけ付ける（男性にはプロフィールを開かせない）。
 * テスト用アカウントは、閲覧者がテストでなければ外す（bootstrap と同じ考え方）。
 */
export async function listAvailabilityFor(viewer: User): Promise<{
  cohort: Cohort | null; byDate: Record<string, AvailPerson[]>; mine: string[];
}> {
  const cohort = getCohort(viewer.age);
  const empty = { cohort, byDate: {} as Record<string, AvailPerson[]>, mine: [] as string[] };
  if (cohort !== 'a') return empty;   // 20〜30代だけ。それ以外には機能自体を出さない
  const adb = getAdminDb() as any;
  if (!adb) return empty;

  const lo = todayJst();
  const [snap, users, banned, testCfg] = await Promise.all([
    adb.collection(COLL).where('updatedAt', '>', 0).limit(2000).get(),
    adb.collection('users').limit(3000).get(),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
    import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null),
  ]);
  const userOf: Record<string, any> = {};
  users.docs.forEach((d: any) => { userOf[d.id] = { id: d.id, ...(d.data() || {}) }; });

  const tset = new Set((testCfg?.accounts || []).map((a: any) => a.id));
  const isTestId = (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
  const viewerIsTest = isTestId(viewer.id);
  const hideTest = !!testCfg?.hideFromGeneral && !viewerIsTest;
  const reveal = viewer.gender === 'female';

  const byDate: Record<string, AvailPerson[]> = {};
  let mine: string[] = [];
  snap.docs.forEach((d: any) => {
    const x = d.data() || {};
    const uid: string = x.userId || d.id;
    const u = userOf[uid];
    if (!u) return;
    if (uid === viewer.id) { mine = normalizeDates(x.dates); }
    if (banned.has(uid) || u.banned) return;
    if (hideTest && isTestId(uid)) return;
    if (getCohort(u.age) !== 'a') return;                         // 同じ年代だけ
    if (u.gender !== 'male' && u.gender !== 'female') return;      // 性別未設定は並べられない（青/ピンクで出すため）
    const dates: string[] = normalizeDates(x.dates).filter((dt) => dt >= lo);
    if (!dates.length) return;
    const person: AvailPerson = { age: u.age, gender: u.gender, car: u.car === 'have', ...(uid === viewer.id ? { me: true } : {}) };
    if (reveal || uid === viewer.id) {
      Object.assign(person, {
        id: uid, name: u.displayName || 'メンバー', avatar: u.avatar || '', avatarUrl: u.avatarUrl || '',
        avatarMode: u.avatarMode || '', color: u.color || '', golmotiType: u.golmotiType || '',
      });
    }
    for (const dt of dates) (byDate[dt] = byDate[dt] || []).push(person);
  });
  // 日付の中は 女性→男性、若い順。見たときに並びが毎回変わらないように。
  for (const dt of Object.keys(byDate)) {
    byDate[dt].sort((a, b) => (a.gender === b.gender ? a.age - b.age : a.gender === 'female' ? -1 : 1));
  }
  return { cohort, byDate, mine };
}

/** 運営向け：日付ごとに、誰が行けるか（名前・年齢・性別・車・エリア・最寄り駅）。テスト垢は除く。 */
export async function listAvailabilityForAdmin(opts?: { includeTest?: boolean }): Promise<{
  byDate: Record<string, Array<{ id: string; name: string; age: number; gender: string; car: string; area: string; nearestStation: string; avatarUrl: string; updatedAt: number }>>;
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
    if (getCohort(u.age) !== 'a') return;
    const dates = normalizeDates(x.dates).filter((dt) => dt >= lo);
    if (!dates.length) return;
    people.add(uid);
    const row = {
      id: uid, name: u.displayName || 'メンバー', age: u.age || 0, gender: u.gender || '', car: u.car || '',
      area: u.area || '', nearestStation: u.nearestStation || '', avatarUrl: u.avatarUrl || '', updatedAt: x.updatedAt || 0,
    };
    for (const dt of dates) (byDate[dt] = byDate[dt] || []).push(row);
  });
  for (const dt of Object.keys(byDate)) byDate[dt].sort((a, b) => (a.gender === b.gender ? a.age - b.age : a.gender === 'female' ? -1 : 1));
  return { byDate, people: people.size };
}
