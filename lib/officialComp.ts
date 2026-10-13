// 「ゴルトモ公式コンペ」の判定（2026-10-13）。参加者一覧の「🏆 公式コンペ◯回」・プロフィールの「内、公式コンペ」で共用。
//   公式（isOfficial）かつ コンペ（isCompetition・無ければ5人以上の募集）
export function isOfficialComp(r: { isOfficial?: boolean; isCompetition?: boolean; maxSpots?: number } | null | undefined): boolean {
  if (!r?.isOfficial) return false;
  return !!r.isCompetition || (Number(r.maxSpots) || 0) >= 5;
}
