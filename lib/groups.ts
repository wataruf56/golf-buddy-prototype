import type { Round, RoundGroup } from './types';

// 組み分け・レビュー対象まわりの共通ヘルパー。
// 「レビューは同じ組の人だけ」「コンペは組み分け必須」「当日来れなかった人は除外」の
// 判定をここに集約する（API・db・UIで同じ定義を使うため）。

export const isGuestId = (id: string): boolean =>
  typeof id === 'string' && id.startsWith('gst_');

// 登録参加者（主催者＋承認済み参加者）。ゲスト（gst_）は含まない。
export function registeredParticipantIds(round: Round): string[] {
  return [round.hostId, ...((round.applicantIds as string[]) || [])].filter(Boolean);
}

// 当日来れなかった人（除外）か。
export function isNoShow(round: Round, userId: string): boolean {
  return (round.noShowIds || []).includes(userId);
}

// 前半の組／後半の組。後半は「前半と入れ替えるときだけ」持つ（無ければ空）。
export const groupsFront = (round: Round): RoundGroup[] => round.groups || [];
export const groupsBack = (round: Round): RoundGroup[] =>
  Array.isArray(round.groupsBack) && round.groupsBack.length ? round.groupsBack : [];
export const hasBackGroups = (round: Round): boolean => groupsBack(round).length > 0;

// userId が属する組。未割り当てなら undefined。half を省略すると前半。
export function groupOfUser(round: Round, userId: string, half: 'front' | 'back' = 'front'): RoundGroup | undefined {
  const gs = half === 'back' ? groupsBack(round) : groupsFront(round);
  return gs.find((g) => (g.memberIds || []).includes(userId));
}

// 同じ組の「レビュー対象になり得る」相手。
// **前半か後半のどちらかで同じ組になった人**すべて（コンペで前半・後半のメンバーを
// 入れ替えることがあるため）。登録ユーザーのみ（ゲスト除外）・自分除外・当日来れなかった人は除外。
export function sameGroupPeerIds(round: Round, userId: string): string[] {
  const registered = new Set(registeredParticipantIds(round));
  const out: string[] = [];
  for (const g of [groupOfUser(round, userId, 'front'), groupOfUser(round, userId, 'back')]) {
    for (const id of g?.memberIds || []) {
      if (id === userId || !registered.has(id) || isGuestId(id) || isNoShow(round, id)) continue;
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

// meId から見て toUserId が「同じ組」か（前半・後半のどちらかで同じ組なら true）。
// 通常募集（コンペでない）は全員が実質同じ組として true。
export function isSameGroup(round: Round, meId: string, toUserId: string): boolean {
  if (!round.isCompetition) return true;
  return (['front', 'back'] as const).some((h) => {
    const g = groupOfUser(round, meId, h);
    return !!g && (g.memberIds || []).includes(toUserId);
  });
}

// コンペの組み分けが「ラウンド完了に必要な条件」を満たすか。
// 登録参加者が全員、いずれかの組に入っている or「当日来れなかった人」に入っている。
// コンペでない募集は常に true（組み分け不要）。
export function competitionGroupsComplete(round: Round): boolean {
  if (!round.isCompetition) return true;
  const grouped = new Set<string>();
  for (const g of round.groups || []) for (const id of g.memberIds || []) grouped.add(id);
  const noShow = new Set(round.noShowIds || []);
  return registeredParticipantIds(round).every((id) => grouped.has(id) || noShow.has(id));
}
