import type { Round } from './types';
import { isRoundHost } from './roundHost';

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
  if (!ids.length) return round;
  if (isRoundHost(round, viewerId)) return round;
  return { ...round, invitedIds: viewerId && ids.includes(viewerId) ? [viewerId] : [] };
}

/**
 * 閲覧者に配ってよい形に整える。**募集を返すところは必ずここを通す**。
 *
 * 1つずつ呼ぶ形にしていたら、新しく足した口で掛け忘れる
 * （実際 /api/rounds/[id]/interest は掛かっていなかった）。まとめてある。
 */
export function stripRoundForViewer(round: Round, viewerId: string | null): Round {
  return stripViews(stripGroupPrefsForViewer(stripInvitesForViewer(round, viewerId), viewerId));
}
