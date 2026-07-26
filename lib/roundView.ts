import type { Round } from './types';

// 組み分け希望（groupPrefs）は主催者だけが集計を見られる。配信時に、主催者以外へは
// 「自分の入力ぶんだけ」に絞る（他の参加者の希望は一切見えないようにする）。
// bootstrap（一覧）と単体GETの両方で必ず通す。
export function stripGroupPrefsForViewer(round: Round, viewerId: string | null): Round {
  if (!round.groupPrefs) return round;
  if (viewerId && round.hostId === viewerId) return round; // 主催者は全員ぶん見える
  const mine = viewerId ? round.groupPrefs[viewerId] : undefined;
  return { ...round, groupPrefs: mine ? { [viewerId as string]: mine } : undefined };
}
