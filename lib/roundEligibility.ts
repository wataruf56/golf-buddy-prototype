// Centralised "can this user join this round?" rules. Used by the join API
// (hard gate) and the UI (soft gate / button disable + explanatory text).
//
// Two conditions on top of the existing host-cohort + age-gate checks:
//   1. beginnerOnly: only score ranges that count as "100台以降" are allowed.
//   2. genderCondition: 'male' / 'female' restricts applicants by user.gender.
//
// We keep these here as plain functions (no DB calls) so server and client
// can apply identical logic.

import type { Round, User } from './types';

// Score ranges considered "beginner / high score" — allowed when beginnerOnly
// is true. Anything outside this set (e.g. 90台 / 80台) means the user is
// already past beginner-level and is blocked from beginner-only rounds.
export const BEGINNER_FRIENDLY_SCORES: ReadonlyArray<string> = [
  'ラウンド未経験',
  'ラウンド数回',
  '100台',
  '110台',
  '120台',
  '130台',
];

const BEGINNER_SET = new Set(BEGINNER_FRIENDLY_SCORES);

export function isBeginnerFriendly(scoreRange: string | undefined | null): boolean {
  if (!scoreRange) return false;
  return BEGINNER_SET.has(scoreRange);
}

export type EligibilityResult =
  | { ok: true }
  | { ok: false; code: 'beginner_only'; message: string }
  | { ok: false; code: 'male_only'; message: string }
  | { ok: false; code: 'female_only'; message: string };

/** Pure check. Caller still has to handle auth/cohort/age separately. */
export function checkRoundEligibility(round: Round, user: User | null | undefined): EligibilityResult {
  if (!user) return { ok: true }; // defensive — callers gate auth elsewhere

  if (round.beginnerOnly && !isBeginnerFriendly(user.scoreRange)) {
    return {
      ok: false,
      code: 'beginner_only',
      message: 'このラウンドは「初心者のみ」です。あなたのスコア帯 (' + (user.scoreRange || '未設定') + ') では申し込めません。',
    };
  }

  const g = round.genderCondition || 'any';
  if (g === 'male' && user.gender !== 'male') {
    return { ok: false, code: 'male_only', message: 'このラウンドは「男性のみ」の募集です。' };
  }
  if (g === 'female' && user.gender !== 'female') {
    return { ok: false, code: 'female_only', message: 'このラウンドは「女性のみ」の募集です。' };
  }

  return { ok: true };
}

/** Display label derived from beginnerOnly + genderCondition. Falls back to
 *  the legacy free-form levelCondition string for rounds created before the
 *  schema change. */
export function levelConditionLabel(round: Pick<Round, 'beginnerOnly' | 'genderCondition' | 'levelCondition'>): string {
  const parts: string[] = [];
  parts.push(round.beginnerOnly ? '初心者のみ' : '誰でも・初心者OK');
  const g = round.genderCondition || 'any';
  if (g === 'male') parts.push('男性のみ');
  else if (g === 'female') parts.push('女性のみ');
  // Legacy rounds with a custom string and no new flags: show the string.
  if (round.beginnerOnly === undefined && round.genderCondition === undefined && round.levelCondition) {
    return round.levelCondition;
  }
  return parts.join(' / ');
}
