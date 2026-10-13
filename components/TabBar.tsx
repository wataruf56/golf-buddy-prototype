'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';

// モック準拠の7タブ（2026-10-08 タイムライン、2026-10-11 過去ラウンドを追加）（絵文字アイコン・クリーム地・インク枠・アクティブはティール）。
// 「募集」はホームのタイルから、「マイ」はホームのプロフィールカードから到達する。
const TWO_LINE: Record<string, [string, string]> = { timeline: ['タイム', 'ライン'], past: ['過去', 'ラウンド'] };

type Tab = { id: string; label: string; href: string; emoji: string; external?: boolean };

const tabs: Tab[] = [
  { id: 'home', label: 'ホーム', href: '/home', emoji: '🏠' },
  { id: 'search', label: 'さがす', href: '/search', emoji: '🔍' },
  { id: 'timeline', label: 'タイムライン', href: '/timeline', emoji: '📰' },
  // 2026-10-11：過去に参加したラウンド（押すとその日のグループチャット・📷でアルバム）
  { id: 'past', label: '過去ラウンド', href: '/rounds/past', emoji: '🏁' },
  { id: 'swing', label: 'スイング', href: '/swing', emoji: '🏌️' },
  { id: 'buddies', label: 'ゴル友', href: '/buddies', emoji: '👥' },
  { id: 'guide', label: '使い方', href: '/guide', emoji: '📖' },
];

export function TabBar({ onBlock }: { onBlock?: (href: string) => boolean }) {
  const pathname = usePathname();
  const { buddiesUnread } = useUnreadCounts();
  const tabBadges: Record<string, number> = { buddies: buddiesUnread };

  return (
    <div className="tab-bar h-[82px] bg-card border-t-2 border-border flex items-start pt-2 flex-shrink-0">
      {tabs.map((t) => {
        const active = pathname?.startsWith(t.href);
        const badge = tabBadges[t.id] || 0;
        const cls = cn(
          'flex-1 flex flex-col items-center gap-0.5 py-1 relative',
          active ? 'text-green' : 'text-muted',
        );
        const inner = (
          <>
            <div className={cn('relative px-2.5 py-0.5 rounded-full transition-colors text-[20px] leading-none', active && 'bg-green-light')}>
              <span>{t.emoji}</span>
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            {/* 狭い画面（380px未満）では長い名前を2行に（「タイムライン」「過去ラウンド」が隣とくっつくため）。高さは全タブそろえる（2026-10-13） */}
            <span className={cn('text-[9px] whitespace-nowrap tracking-tighter text-center leading-[1.15] max-[379px]:min-h-[21px]', active ? 'font-bold' : 'font-medium')}>
              {TWO_LINE[t.id] ? <><span className="max-[379px]:hidden">{t.label}</span><span className="hidden max-[379px]:inline">{TWO_LINE[t.id][0]}<br />{TWO_LINE[t.id][1]}</span></> : t.label}
            </span>
          </>
        );
        if (t.external) return <a key={t.id} href={t.href} className={cls}>{inner}</a>;
        return (
          <Link
            key={t.id}
            href={t.href}
            onClick={(e) => { if (onBlock && onBlock(t.href)) e.preventDefault(); }}
            className={cls}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
