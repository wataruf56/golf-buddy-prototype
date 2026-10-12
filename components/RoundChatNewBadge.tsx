'use client';

import { useUnreadCounts } from '@/lib/useUnread';

// 参加している募集のグループチャットに、まだ見ていない動き（発言・スレッド）があるときの「💬 新着」（2026-10-12）。
// メンションされていなければ LINE は来ないので、画面で気づけるように。チャットを一度開けば消える（lib/useUnread）。
export function RoundChatNewBadge({ roundId, className = '' }: { roundId: string; className?: string }) {
  const { unreadRoundIds } = useUnreadCounts();
  if (!unreadRoundIds.has(roundId)) return null;
  return (
    <span className={'inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-black bg-red text-white flex-shrink-0 ' + className}>💬 新着</span>
  );
}
