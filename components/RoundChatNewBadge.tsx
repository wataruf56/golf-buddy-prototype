'use client';

import { useUnreadCounts } from '@/lib/useUnread';
import { badgeText } from '@/lib/roundUnread';

// LINE と同じ赤い丸の件数バッジ（①②…・99件を超えたら 99+）（2026-10-13）
export function UnreadCountBadge({ n, label, className = '' }: { n: number; label?: string; className?: string }) {
  if (!(n > 0) && !label) return null;
  return (
    <span className={'inline-grid place-items-center min-w-[18px] h-[18px] px-[5px] rounded-full bg-red text-white text-[10.5px] font-black leading-none flex-shrink-0 ' + className}
      aria-label={n > 0 ? `未読${n}件` : label}>{n > 0 ? badgeText(n) : label}</span>
  );
}

// 参加している募集のグループチャットに、まだ見ていない発言・スレッドがあるときの表示（2026-10-12・件数は 2026-10-13）。
// メンションされていなければ LINE は来ないので、画面で気づけるように。そのチャット（スレッド）を開けば消える（lib/useUnread・lib/roundUnread）。
//   pill  … 募集カード：「💬 参加中のラウンドに新着メッセージ ③」
//   label … 募集ページのチャットボタン：「新着メッセージ ③」
//   count … 一覧の行：赤い丸の件数だけ
export function RoundChatNewBadge({ roundId, variant = 'count', className = '' }: { roundId: string; variant?: 'pill' | 'label' | 'count'; className?: string }) {
  const { unreadRoundIds, countByRound } = useUnreadCounts();
  if (!unreadRoundIds.has(roundId)) return null;
  const n = countByRound[roundId] || 0;
  if (variant === 'count') return <UnreadCountBadge n={n} label="新" className={className} />;
  return (
    <span className={'inline-flex items-center gap-1 pl-2 pr-1 py-[2px] rounded-full text-[10.5px] font-black bg-red-50 text-red border border-red flex-shrink-0 ' + className}>
      {variant === 'pill' ? '💬 参加中のラウンドに新着メッセージ' : '新着メッセージ'}
      {n > 0 ? <UnreadCountBadge n={n} /> : <span className="pr-1" />}
    </span>
  );
}
