import type { Round, User, Gender } from './types';
import { canGenderJoin } from './roundEligibility';

// 男女別の募集枠（spotsMale / spotsFemale / spotsAny）の「いまの埋まり具合」。
// 画面（一覧カード・詳細・主催者の空き待ち一覧）とサーバー（参加申請・承認のガード）で同じ判定を使う。
//
// 保存されている spotsMale/Female/Any は「これから募集する人数」（主催者と知り合い枠は含まない。
// 募集作成の API が maxSpots = 1(主催者) + 知り合い枠 + 募集枠 と組み立てる）。
// だから数える人＝参加確定（applicantIds）だけ。主催者・知り合い枠を足すと枠が1〜2人ぶん早く「満員」になる（最初の版で踏んだ）。
// 旧データ（内訳が全部0）は男女の制限なし（合計枠 maxSpots だけ）。

export type SlotGender = 'male' | 'female';
export const slotGenderLabel = (g: SlotGender) => (g === 'male' ? '男性' : '女性');
export const slotGenderIcon = (g: SlotGender) => (g === 'male' ? '👨' : '👩');
export const asSlotGender = (g: Gender | undefined | null): SlotGender | undefined => (g === 'male' || g === 'female' ? g : undefined);

export function memberGendersForSlots(round: Round, users: User[]): Array<Gender | undefined> {
  const out: Array<Gender | undefined> = [];
  const seen = new Set<string>();
  for (const id of round.applicantIds || []) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(users.find((u) => u.id === id)?.gender);
  }
  return out;
}

export function hasGenderBreakdown(round: Round): boolean {
  return (round.spotsMale || 0) + (round.spotsFemale || 0) + (round.spotsAny || 0) > 0;
}

export type SlotCol = { cap: number; used: number; full: boolean; left: number };
export type SlotStatus = { has: boolean; male: SlotCol; female: SlotCol; any: { cap: number; used: number } };

/** 表示用：各枠の使用数・残り。男女の「残り」には「どちらでも枠」の残りも足す（実際にその人が入れる数）。 */
export function genderSlotStatus(round: Round, users: User[]): SlotStatus {
  const sm = round.spotsMale || 0, sf = round.spotsFemale || 0, sa = round.spotsAny || 0;
  const has = hasGenderBreakdown(round);
  let m = 0, f = 0, o = 0;
  for (const g of memberGendersForSlots(round, users)) {
    if (g === 'male') m++; else if (g === 'female') f++; else o++;
  }
  const maleUsed = Math.min(m, sm), femaleUsed = Math.min(f, sf);
  const anyUsed = (m - maleUsed) + (f - femaleUsed) + o;
  const anyLeft = Math.max(0, sa - anyUsed);
  const col = (cap: number, used: number): SlotCol => {
    const left = Math.max(0, cap - used) + anyLeft;
    return { cap, used, full: has && left <= 0, left };
  };
  return { has, male: col(sm, maleUsed), female: col(sf, femaleUsed), any: { cap: sa, used: Math.min(anyUsed, sa) } };
}

/** いま g の人が入れないか（サーバーの参加ガードと同じ判定）。内訳の無い募集は false。 */
export function slotFullFor(round: Round, users: User[], g: Gender | undefined): boolean {
  if (!hasGenderBreakdown(round)) return false;
  return !canGenderJoin(round, memberGendersForSlots(round, users), g);
}

/** 見ている人（男性 or 女性）にとって「自分の枠だけ満員」か。全体が満員のときは false（ふつうの満員表示に任せる）。 */
export function viewerSlotFull(round: Round, users: User[], viewerGender: Gender | undefined | null): SlotGender | null {
  const g = asSlotGender(viewerGender);
  if (!g) return null;
  if (round.eventType === 'drink') return null;
  if ((round.currentCount || 0) >= (round.maxSpots || 0)) return null;
  return slotFullFor(round, users, g) ? g : null;
}

export function isWaitlisted(round: Round, meId: string | null | undefined): boolean {
  return !!meId && (round.waitlist || []).some((e) => e.userId === meId);
}
