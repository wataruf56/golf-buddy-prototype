// Age gate for matching features (rounds, DM, buddies).
// Currently: only 20s and 30s (age 20–39) may use matching.
// Everyone else (incl. age unset) is restricted to "swing analysis only".

export const MATCHING_MIN_AGE = 20;
export const MATCHING_MAX_AGE = 39;

export function isMatchingAllowedByAge(age: number | undefined | null): boolean {
  if (!age || age <= 0) return false;
  return age >= MATCHING_MIN_AGE && age <= MATCHING_MAX_AGE;
}

export function ageGateReason(age: number | undefined | null): 'unset' | 'too_young' | 'too_old' | 'ok' {
  if (!age || age <= 0) return 'unset';
  if (age < MATCHING_MIN_AGE) return 'too_young';
  if (age > MATCHING_MAX_AGE) return 'too_old';
  return 'ok';
}
