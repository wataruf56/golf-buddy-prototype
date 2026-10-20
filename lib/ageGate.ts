// Age-based cohort gating for matching features (rounds, DM, buddies).
// Two parallel communities — users from A and B never interact.
//   Cohort 'a' = 20s/30s   (age 20–39)
//   Cohort 'b' = 40s/50s   (age 40–59) — includes early-50s by spec extension
// Anyone else (under 20, 60+, age unset) → no matching, swing-only.

export type Cohort = 'a' | 'b';

export const COHORT_RANGES: Record<Cohort, { min: number; max: number; label: string; short: string }> = {
  a: { min: 20, max: 39, label: '20〜30代限定コミュニティ', short: '20〜30代' },
  b: { min: 40, max: 59, label: '40〜50代限定コミュニティ', short: '40〜50代' },
};

export function getCohort(age: number | undefined | null): Cohort | null {
  if (!age || age <= 0) return null;
  if (age >= COHORT_RANGES.a.min && age <= COHORT_RANGES.a.max) return 'a';
  if (age >= COHORT_RANGES.b.min && age <= COHORT_RANGES.b.max) return 'b';
  return null;
}

export function cohortLabel(c: Cohort | null | undefined): string {
  if (!c) return '';
  return COHORT_RANGES[c].label;
}

export function cohortShort(c: Cohort | null | undefined): string {
  if (!c) return '';
  return COHORT_RANGES[c].short;
}

/** 見るときの年代（2026-10-08）。年齢未入力の新規会員にも20〜30代の画面を見せる（プロフィール入力で離脱させない）。
 *  参加・募集など「する」ときは今まで通り getCohort / isMatchingAllowedByAge で年齢を必須にする。 */
export function viewCohort(age: number | undefined | null): Cohort | null {
  return getCohort(age) ?? ((!age || age <= 0) ? 'a' : null);
}

export function isMatchingAllowedByAge(age: number | undefined | null): boolean {
  return getCohort(age) !== null;
}

export function ageGateReason(age: number | undefined | null): 'unset' | 'too_young' | 'too_old' | 'ok' {
  if (!age || age <= 0) return 'unset';
  if (getCohort(age)) return 'ok';
  if (age < COHORT_RANGES.a.min) return 'too_young';
  return 'too_old';
}

// ───── 人ごとの年代（2026-10-20）─────
// 運営が管理画面で「20〜30代のコミュニティを特例で見られる」にした人（users.cohortOverride='a'）は、年齢が40歳以上でも20〜30代として扱う。
// 年齢だけで判断する getCohort / viewCohort / isMatchingAllowedByAge の代わりに、人（ユーザー）を渡すときはこちらを使う。
type AgeUser = { age?: number | null; birthday?: string | null; cohortOverride?: string | null } | null | undefined;
export function userCohort(u: AgeUser): Cohort | null {
  if ((u as any)?.cohortOverride === 'a') return 'a';
  return getCohort(liveAge(u));
}
export function userViewCohort(u: AgeUser): Cohort | null {
  if ((u as any)?.cohortOverride === 'a') return 'a';
  return viewCohort(liveAge(u));
}

// ───── 誕生日から年齢（2026-10-20 本人指定）─────
// 入力は年齢ではなく誕生日（users.birthday 'YYYY-MM-DD'）。年齢は今日（日本時間）の時点で数える＝40歳の誕生日から20〜30代は見られなくなる。
// 誕生日がまだ無い前からの会員は、登録した年齢（users.age）のまま。
const JST_MS = 9 * 3600 * 1000;
export function parseBirthday(b: unknown): { y: number; m: number; d: number } | null {
  const s = typeof b === 'string' ? b : '';
  const mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!mt) return null;
  const y = +mt[1], m = +mt[2], d = +mt[3];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}
/** 誕生日から、今日（日本時間）の年齢。誕生日が正しくなければ 0 */
export function ageFromBirthday(b: unknown, now = Date.now()): number {
  const p = parseBirthday(b);
  if (!p) return 0;
  const t = new Date(now + JST_MS);
  const ty = t.getUTCFullYear(), tm = t.getUTCMonth() + 1, td = t.getUTCDate();
  let age = ty - p.y;
  if (tm < p.m || (tm === p.m && td < p.d)) age--;
  return age;
}
/** 入れられる誕生日か（10〜99歳・未来の日付はだめ） */
export function isValidBirthday(b: unknown, now = Date.now()): boolean {
  if (!parseBirthday(b)) return false;
  const a = ageFromBirthday(b, now);
  return a >= 10 && a <= 99;
}
/** その人の今の年齢（誕生日があれば誕生日から、なければ登録した年齢） */
export function liveAge(u: AgeUser): number {
  const b = (u as any)?.birthday;
  if (b && parseBirthday(b)) return ageFromBirthday(b);
  return Number(u?.age) || 0;
}
/** 読み出した会員の age を誕生日からの今の年齢にそろえる（lib/db の getUser / listUsers で通す） */
export function withLiveAge<T extends { age?: number; birthday?: string | null }>(u: T): T {
  if (!u || !u.birthday || !parseBirthday(u.birthday)) return u;
  const a = ageFromBirthday(u.birthday);
  return a === u.age ? u : { ...u, age: a };
}
export function isMatchingAllowedUser(u: AgeUser): boolean {
  return userCohort(u) !== null;
}
