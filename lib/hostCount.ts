// 主催者を参加人数に数えるか（2026-10-12）。
// 管理者が「ゴルトモ公式」として立てた募集は、主催者（管理者）本人を参加者に数えない
// （hostNotCounted: true）。それ以外の募集（既存データ含む）は従来どおり主催者を1人として数える。
//
// 公式募集でも、主催者本人がプレーしたいときは募集画面の「わたしも参加する」で
// hostJoined: true にできる（2026-10-12）。参加中は主催者をふつうの参加者として数える
// （人数・組み分け・配車・入金・レビュー・スコア…すべて）。やめれば元の「数えない」に戻る。
// hostNotCounted は「この募集は主催者の席を最初から取っていない」という募集の性質として残し、
// 参加しているかどうかは hostJoined だけで表す（POST /api/rounds/[id]/host-join）。
//
// 席の考え方：
//   ふつうの募集 … maxSpots = 主催者の席(1) + 知り合い枠 + 募集枠。主催者は募集枠の外。
//   公式募集     … maxSpots = 知り合い枠 + 募集枠。主催者の席は無い。
//                  主催者が参加するときは**募集枠を1つ使う**（男女別の枠もその人の性別で1つ）。
//                  だから満員なら参加できない。
// 画面とサーバーの両方から使うので、server-only なものは import しない。

type HostCountable = { hostId?: string; hostNotCounted?: boolean; hostJoined?: boolean; applicantIds?: string[]; currentCount?: number };

/** 主催者を参加人数に数えるか（ふつうの募集、または公式募集で主催者が参加中）。 */
export function hostCounts(round: HostCountable | null | undefined): boolean {
  return !round?.hostNotCounted || !!round?.hostJoined;
}

/** 主催者が参加人数（currentCount）に占める数（数えるなら1、数えないなら0）。 */
export function hostSeat(round: HostCountable | null | undefined): 0 | 1 {
  return hostCounts(round) ? 1 : 0;
}

/**
 * 募集枠の外に取ってある主催者の席（maxSpots の組み立て用）。
 * ふつうの募集は1、公式募集は0（主催者が参加しても募集枠を使うので0のまま）。
 */
export function reservedHostSeat(round: HostCountable | null | undefined): 0 | 1 {
  return round?.hostNotCounted ? 0 : 1;
}

/** 主催者が「募集枠」を1つ使って参加しているか（公式募集で参加中）。男女別の枠の集計に入れる。 */
export function hostInRecruitSlots(round: HostCountable | null | undefined): boolean {
  return !!round?.hostNotCounted && !!round?.hostJoined;
}

/** 主催者が「わたしも参加する／やめる」を選べる募集か（公式募集）。 */
export function hostCanOptIn(round: HostCountable | null | undefined): boolean {
  return !!round?.hostNotCounted;
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
