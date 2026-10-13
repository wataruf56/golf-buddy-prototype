import type { Round } from './types';
import { isRoundHost } from './roundHost';
import { stripCancelAccountForViewer } from './cancelPolicy';

// 組み分け希望（groupPrefs）は主催者だけが集計を見られる。配信時に、主催者以外へは
// 「自分の入力ぶんだけ」に絞る（他の参加者の希望は一切見えないようにする）。
// bootstrap（一覧）と単体GETの両方で必ず通す。
export function stripGroupPrefsForViewer(round: Round, viewerId: string | null): Round {
  if (!round.groupPrefs) return round;
  if (isRoundHost(round, viewerId)) return round; // 主催者・共同管理者は全員ぶん見える
  const mine = viewerId ? round.groupPrefs[viewerId] : undefined;
  return { ...round, groupPrefs: mine ? { [viewerId as string]: mine } : undefined };
}

// 「見に来た人」(viewedBy) は主催者だけが見られる。通常の配信（bootstrap一覧・単体GET）では
// 誰に対しても必ず落とす。主催者へは専用の host-gated エンドポイント /api/rounds/[id]/viewers
// 経由でのみ返す（ユーザー情報を join した形で）。ここで無条件に除去して漏洩を防ぐ。
export function stripViews(round: Round): Round {
  if (!round.viewedBy) return round;
  return { ...round, viewedBy: undefined };
}

// 招待した相手（invitedIds）は主催者だけが見られる。
//
// 画面では前から主催者だけに出していたが、**応答には全員ぶんのIDが入ったまま**
// だった。招待はまだ参加していない人なので、他の閲覧者には参加者と紛らわしく、
// そもそも「誰を誘ったか」は主催者の手の内。
//
// ただし**自分が招待されているかの判定**には要る（ホームの「招待されています」、
// 主催者へのDM可否、招待の受諾ボタン）。だから消しきらず、
// 主催者以外へは**自分のIDだけ**を残す。
export function stripInvitesForViewer(round: Round, viewerId: string | null): Round {
  const ids = round.invitedIds || [];
  const hasMaps = !!(round.invitedBy || round.invitedAt || round.inviteMessages || round.inviteSeenAt || round.inviteDeclined);
  if (!ids.length && !hasMaps) return round;
  if (isRoundHost(round, viewerId)) return round;
  // 招待の付帯情報（誰が招待したか・時刻・一言）も userId がキーなので、自分のぶんだけ残す（2026-10-13）
  const mine = <T,>(m?: Record<string, T>): Record<string, T> | undefined => {
    if (!m) return undefined;
    return viewerId && Object.prototype.hasOwnProperty.call(m, viewerId) ? { [viewerId]: m[viewerId] } : {};
  };
  return {
    ...round,
    invitedIds: viewerId && ids.includes(viewerId) ? [viewerId] : [],
    ...(round.invitedBy ? { invitedBy: mine(round.invitedBy) } : {}),
    ...(round.invitedAt ? { invitedAt: mine(round.invitedAt) } : {}),
    ...(round.inviteMessages ? { inviteMessages: mine(round.inviteMessages) } : {}),
    // 既読・「行けない」（2026-10-13）も同じ。招待した側（主催者・共同管理者）だけが全員ぶん見られる
    ...(round.inviteSeenAt ? { inviteSeenAt: mine(round.inviteSeenAt) } : {}),
    ...(round.inviteDeclined ? { inviteDeclined: mine(round.inviteDeclined) } : {}),
  };
}

/**
 * 閲覧者に配ってよい形に整える。**募集を返すところは必ずここを通す**。
 *
 * 1つずつ呼ぶ形にしていたら、新しく足した口で掛け忘れる
 * （実際 /api/rounds/[id]/interest は掛かっていなかった）。まとめてある。
 */
// 組み分け・配車は、主催者が「公開する」を押すまで参加者に見せない（2026-10-06）。
// 未公開（assignmentsPublished === false）のとき、主催者以外へは groups / groupsBack / carAssignments を空にし、
// 何かしら入っていれば assignmentsHidden=true を付けて「主催者が準備中」と出せるようにする。
// 旧データ（未設定）はこれまでどおり見せる。
// 配車（ピックアップ）が公開か。未設定（分ける前のデータ）は組み分けの公開に従う。
export function carsPublishedOf(round: Pick<Round, 'carsPublished' | 'assignmentsPublished'>): boolean {
  return round.carsPublished ?? (round.assignmentsPublished !== false);
}
export function groupsPublishedOf(round: Pick<Round, 'assignmentsPublished'>): boolean {
  return round.assignmentsPublished !== false;
}

// 組み分けと配車は、主催者がそれぞれ「公開する」を押すまで主催者以外に伏せる（2026-10-08 別々に）。
export function stripAssignmentsForViewer(round: Round, viewerId: string | null): Round {
  const g = groupsPublishedOf(round), c = carsPublishedOf(round);
  if (g && c) return round;
  if (isRoundHost(round, viewerId)) return round;
  let out: Round = { ...round };
  if (!g) {
    const has = (round.groups?.length || 0) + (round.groupsBack?.length || 0) > 0;
    out = { ...out, groups: [], groupsBack: [], assignmentsHidden: has };
  }
  if (!c) {
    const has = (round.carAssignments?.length || 0) > 0;
    out = { ...out, carAssignments: [], carsHidden: has };
  }
  return out;
}

// 空き待ち（2026-10-07）：主催者には全員ぶん。それ以外には自分のぶんだけ＋男女別の人数＋自分の順番。
export function stripWaitlistForViewer(round: Round, viewerId: string | null): Round {
  const list = round.waitlist || [];
  if (!list.length) return round;
  const counts = { male: list.filter((e) => e.gender === 'male').length, female: list.filter((e) => e.gender === 'female').length };
  if (isRoundHost(round, viewerId)) return { ...round, waitlistCounts: counts };
  const mine = viewerId ? list.filter((e) => e.userId === viewerId) : [];
  const rank = mine.length ? list.filter((e) => e.gender === mine[0].gender).findIndex((e) => e.userId === viewerId) + 1 : 0;
  return { ...round, waitlist: mine, waitlistCounts: counts, ...(rank > 0 ? { waitlistRank: rank } : {}) };
}

// 見送った申請は、主催者には全員ぶん、それ以外には自分のぶんだけ（2026-10-11）
export function stripRejectedForViewer(round: Round, viewerId: string | null): Round {
  const list = (round as any).rejectedApplicants as Array<{ userId: string; at: number; afterHold?: boolean }> | undefined;
  if (!list?.length || isRoundHost(round, viewerId)) return round;
  return { ...round, rejectedApplicants: viewerId ? list.filter((e) => e.userId === viewerId) : [] } as Round;
}

// 参加申請の保留（2026-10-13・lib/roundHold）：主催者には全員ぶん、それ以外には自分のぶんだけ。
// 「1回使った人」（holdUsedIds）も同じ（自分のIDだけ残す）。
export function stripHoldsForViewer(round: Round, viewerId: string | null): Round {
  const holds = round.holds;
  const used = round.holdUsedIds;
  if ((!holds || !Object.keys(holds).length) && !used?.length) return round;
  if (isRoundHost(round, viewerId)) return round;
  const mineHold = viewerId && holds && Object.prototype.hasOwnProperty.call(holds, viewerId) ? { [viewerId]: holds[viewerId] } : {};
  return {
    ...round,
    ...(holds ? { holds: mineHold } : {}),
    ...(used ? { holdUsedIds: viewerId && used.includes(viewerId) ? [viewerId] : [] } : {}),
  };
}

// 取りやめ・取り下げの記録（cancellations：名前・理由つき）は主催者・共同管理者だけのもの（types.ts の約束）。
// 以前は配信で落としておらず全員に届いていた（2026-10-13 保留の実装時に気づいた）。主催者以外には自分のぶんだけ。
export function stripCancellationsForViewer(round: Round, viewerId: string | null): Round {
  const list = round.cancellations;
  if (!list?.length || isRoundHost(round, viewerId)) return round;
  return { ...round, cancellations: viewerId ? list.filter((c) => c?.userId === viewerId) : [] };
}

// 入金の振込先は、主催者・共同主催・承認済みの参加者だけに見せる（2026-10-11）
export function stripPaymentForViewer(round: Round, viewerId: string | null): Round {
  const pi = (round as any).paymentInfo;
  if (!pi?.account) return round;
  const inIt = !!viewerId && (isRoundHost(round, viewerId) || (round.applicantIds || []).includes(viewerId));
  if (inIt) return round;
  const { account, ...rest } = pi;
  return { ...round, paymentInfo: { ...rest, accountHidden: true } } as Round;
}

export function stripRoundForViewer(round: Round, viewerId: string | null): Round {
  return _strip(stripCancellationsForViewer(stripHoldsForViewer(stripPaymentForViewer(stripRejectedForViewer(round, viewerId), viewerId), viewerId), viewerId), viewerId);
}
function _strip(round: Round, viewerId: string | null): Round {
  return stripCancelAccountForViewer(stripWaitlistForViewer(stripAssignmentsForViewer(stripViews(stripGroupPrefsForViewer(stripInvitesForViewer(round, viewerId), viewerId)), viewerId), viewerId), viewerId);
}
