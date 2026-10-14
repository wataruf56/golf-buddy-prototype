// 募集の公開範囲（2026-10-14）。画面とサーバーの両方で使う（server-only は import しない）。
//   public（未設定）… 今までどおり、だれでも見られる
//   invite           … 非公開の招待。主催者・共同管理者・参加者・申請中・招待された人（＋運営）だけが見られる。
//                      さがす・ホーム・タイムライン・希望条件の通知・公開の募集一覧（/links）には出さない。
// サーバー側では、募集を返す経路（/api/bootstrap・/api/rounds・/api/rounds/[id] など）で必ず canViewRound を通す。
// 画面側で隠すだけでは、募集の一覧がブラウザに届いてしまうため。
import type { Round } from './types';

type R = Pick<Round, 'hostId' | 'coHostIds' | 'applicantIds' | 'pendingApplicantIds' | 'invitedIds' | 'invitedAt' | 'inviteDeclined' | 'visibility' | 'revokedIds'>;

export const isPrivateRound = (r: Partial<R> | null | undefined): boolean => r?.visibility === 'invite';

/** 非公開の募集を開ける人（主催者・共同管理者・参加者・申請中・招待中・招待されたことがある人）。取り消された人は除く。 */
export function privateAccessIds(r: Partial<R>): Set<string> {
  const out = new Set<string>();
  const add = (x?: string | null) => { if (x) out.add(x); };
  add(r.hostId);
  (r.coHostIds || []).forEach(add);
  (r.applicantIds || []).forEach(add);
  (r.pendingApplicantIds || []).forEach(add);
  (r.invitedIds || []).forEach(add);
  // 招待されたことがある人（参加した・行けないと答えたあとも、内容は見られる）
  const revoked = new Set(r.revokedIds || []);
  Object.keys(r.invitedAt || {}).forEach((x) => { if (!revoked.has(x)) add(x); });
  Object.keys(r.inviteDeclined || {}).forEach((x) => { if (!revoked.has(x)) add(x); });
  return out;
}

/** この人がこの募集を見られるか。isAdmin＝運営（見回りのため全部見られる）。 */
export function canViewRound(r: Partial<R> | null | undefined, viewerId: string | null | undefined, isAdmin = false): boolean {
  if (!r) return false;
  if (!isPrivateRound(r)) return true;
  if (isAdmin) return true;
  if (!viewerId) return false;
  return privateAccessIds(r).has(viewerId);
}

export const PRIVATE_ROUND_MESSAGE = 'この募集は、招待された人だけが見られます';
