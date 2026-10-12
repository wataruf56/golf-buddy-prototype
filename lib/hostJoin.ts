// 公式募集（hostNotCounted）の主催者が「わたしも参加する／参加をやめる」を選ぶときの判定（2026-10-12）。
// 画面（ボタンの出し分け・押せない理由）とサーバー（POST /api/rounds/[id]/host-join）で同じ判定を使う。
// 人数の数え方そのものは lib/hostCount（hostJoined）。server-only なものは import しない。

import type { Gender, Round } from './types';
import { hostCanOptIn, currentCountOf } from './hostCount';
import { canGenderJoin, genderFullMessage } from './roundEligibility';

export type HostJoinBlock = { code: string; message: string };

/** 主催者を参加させたいとき、いまできない理由（できるなら null）。 */
export function hostJoinBlock(
  round: Round,
  memberGenders: Array<Gender | undefined>,
  hostGender: Gender | undefined,
): HostJoinBlock | null {
  if (!hostCanOptIn(round)) return { code: 'not_optional', message: 'この募集では主催者はもともと参加者に数えられています' };
  if (round.hostJoined) return null; // すでに参加中（冪等）
  if (round.status === 'completed') return { code: 'completed', message: '完了した募集では参加を変更できません' };
  if ((round as any).heldCancelledAt) return { code: 'cancelled', message: '中止した募集では参加を変更できません' };
  if (currentCountOf(round) + 1 > (round.maxSpots || 0)) {
    return { code: 'full', message: '満員のため参加できません。参加するには、編集で募集人数を1人増やしてください' };
  }
  // 男女別の募集枠：主催者も自分の性別の枠（＋どちらでも枠）を1つ使う。memberGenders は参加確定の人
  if (!canGenderJoin(round, memberGenders, hostGender)) {
    return { code: 'gender_full', message: genderFullMessage(hostGender) + '参加するには、編集で募集枠を増やしてください' };
  }
  return null;
}

/** 主催者の参加をやめたいとき、いまできない理由（できるなら null）。 */
export function hostLeaveBlock(round: Round): HostJoinBlock | null {
  if (!hostCanOptIn(round)) return { code: 'not_optional', message: 'この募集では主催者は参加をやめられません' };
  if (!round.hostJoined) return null; // すでに不参加（冪等）
  if (round.status === 'completed') return { code: 'completed', message: '完了した募集では参加を変更できません' };
  return null;
}
