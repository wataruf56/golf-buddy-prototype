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

export function isMatchingAllowedByAge(age: number | undefined | null): boolean {
  return getCohort(age) !== null;
}

export function ageGateReason(age: number | undefined | null): 'unset' | 'too_young' | 'too_old' | 'ok' {
  if (!age || age <= 0) return 'unset';
  if (getCohort(age)) return 'ok';
  if (age < COHORT_RANGES.a.min) return 'too_young';
  return 'too_old';
}
