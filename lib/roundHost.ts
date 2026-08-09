import type { Round } from './types';

// ラウンドの「管理者」判定。主催者(hostId)＋共同管理者(coHostIds)は同じ権限を持つ。
// サーバー(API権限ゲート)・クライアント(isHost)の両方でこれを使う。
export function isRoundHost(round: Pick<Round, 'hostId' | 'coHostIds'> | null | undefined, uid: string | null | undefined): boolean {
  if (!round || !uid) return false;
  if (round.hostId === uid) return true;
  return Array.isArray(round.coHostIds) && round.coHostIds.includes(uid);
}
