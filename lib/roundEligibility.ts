// Centralised "can this user join this round?" rules. Used by the join API
// (hard gate) and the UI (soft gate / button disable + explanatory text).
//
// Two conditions on top of the existing host-cohort + age-gate checks:
//   1. beginnerOnly: only score ranges that count as "100台以降" are allowed.
//   2. genderCondition: 'male' / 'female' restricts applicants by user.gender.
//
// We keep these here as plain functions (no DB calls) so server and client
// can apply identical logic.

import type { Round, User, Gender } from './types';

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

// 性別ごとの募集枠（spotsMale/Female/Any）に空きがあるかの純チェック。
// approvedGenders = すでに承認済みの参加者（主催者を除く）の性別配列。
// g = これから加わる人の性別。バケツ割り当て：男性→男性枠（あふれたら どちらでも枠）、
// 女性→女性枠（あふれたら どちらでも枠）、未設定→どちらでも枠のみ。
// 内訳が未設定の旧データ（全部0）は per-gender 制限なしとして true を返す（合計枠は別途maxSpotsで担保）。
export function canGenderJoin(
  round: Round,
  approvedGenders: Array<Gender | undefined>,
  g: Gender | undefined,
): boolean {
  const sm = round.spotsMale || 0;
  const sf = round.spotsFemale || 0;
  const sa = round.spotsAny || 0;
  if (sm === 0 && sf === 0 && sa === 0) return true; // 旧データ／内訳なし
  let male = 0, female = 0, other = 0;
  for (const x of [...approvedGenders, g]) {
    if (x === 'male') male++;
    else if (x === 'female') female++;
    else other++;
  }
  const anyUsed = Math.max(0, male - sm) + Math.max(0, female - sf) + other;
  return anyUsed <= sa;
}

// 満員時のメッセージ（gは加わろうとした人の性別）。
export function genderFullMessage(g: Gender | undefined): string {
  const label = g === 'male' ? '男性' : g === 'female' ? '女性' : 'この性別';
  return `このラウンドの${label}の募集枠は満員です。`;
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
