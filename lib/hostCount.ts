// 主催者を参加人数に数えるか（2026-10-12）。
// 管理者が「ゴルトモ公式」として立てた募集は、主催者（管理者）本人を参加者に数えない
// （hostNotCounted: true）。管理者がプレーするときは別アカウントで参加申請する。
// それ以外の募集（既存データ含む）は従来どおり主催者を1人として数える。
// 画面とサーバーの両方から使うので、server-only なものは import しない。

type HostCountable = { hostId?: string; hostNotCounted?: boolean; applicantIds?: string[]; currentCount?: number };

/** 主催者を参加人数に数えるか。 */
export function hostCounts(round: HostCountable | null | undefined): boolean {
  return !round?.hostNotCounted;
}

/** 主催者が占める枠の数（数える募集は1、公式募集は0）。 */
export function hostSeat(round: HostCountable | null | undefined): 0 | 1 {
  return hostCounts(round) ? 1 : 0;
}

/** 参加者として数える人のID（主催者＋参加確定）。数えない募集では主催者を外す。重複・空は除く。 */
export function countedMemberIds(round: HostCountable | null | undefined): string[] {
  if (!round) return [];
  const ids = [...(hostCounts(round) ? [round.hostId || ''] : []), ...(round.applicantIds || [])];
  return Array.from(new Set(ids.filter(Boolean)));
}

/**
 * いまの参加人数（`currentCount || 1` の置き換え）。
 * 主催者を数えない募集は 0人が正しい値なので 1 にしない。数える募集は従来どおり（0/未設定→1）。
 */
export function currentCountOf(round: HostCountable | null | undefined): number {
  if (hostCounts(round)) return round?.currentCount || 1;
  return typeof round?.currentCount === 'number' ? round.currentCount : 0;
}

/** 人数が減るときの下限（主催者の分）。`Math.max(1, …)` の置き換え。 */
export function countFloor(round: HostCountable | null | undefined): number {
  return hostSeat(round);
}
