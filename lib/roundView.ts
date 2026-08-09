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
