'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Activity, Plus, Users, User, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';

type Tab = { id: string; label: string; href: string; icon: any; external?: boolean; isNew?: boolean };

const tabs: Tab[] = [
  { id: 'guide', label: '使い方', href: '/guide', icon: BookOpen },
  { id: 'home', label: 'ホーム', href: '/home', icon: Home },
  { id: 'search', label: 'さがす', href: '/search', icon: Search },
  { id: 'swing', label: 'スイング', href: '/swing', icon: Activity },
  { id: 'create', label: '募集', href: '/create', icon: Plus },
  { id: 'buddies', label: 'ゴル友', href: '/buddies', icon: Users },
  // 診断はアプリ本体から除外（独立LPへ移行）。プロフィールのタイプ選択のみ残す。
  { id: 'mypage', label: 'マイ', href: '/mypage', icon: User },
];

export function TabBar({ onBlock }: { onBlock?: (href: string) => boolean }) {
  const pathname = usePathname();
  const { totalUnread, buddiesUnread } = useUnreadCounts();
  const tabBadges: Record<string, number> = {
    buddies: buddiesUnread,
    mypage: totalUnread,
  };
  return (
    <div className="tab-bar h-[82px] bg-card border-t border-border flex items-start pt-2 flex-shrink-0">
      {tabs.map((t) => {
        const active = pathname?.startsWith(t.href);
        const Icon = t.icon;
        const badge = tabBadges[t.id] || 0;
        const cls = cn(
          'flex-1 flex flex-col items-center gap-0.5 py-1 -webkit-tap-highlight-color-transparent relative',
          active ? 'text-green' : 'text-muted'
        );
        const inner = (
          <>
            <div className="relative">
              <Icon size={24} strokeWidth={2} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
              {t.isNew && (
                <span className="absolute -top-1.5 -right-3 bg-orange text-white text-[8px] font-black rounded-full px-1 py-px border border-card">NEW</span>
              )}
            </div>
            <span className={cn('text-[10px]', active ? 'font-bold' : 'font-medium')}>{t.label}</span>
          </>
        );
        // 診断タブは静的ページ /golmoti なので通常リンクで全画面遷移
        if (t.external) {
          return <a key={t.id} href={t.href} className={cls}>{inner}</a>;
        }
        return (
          <Link
            key={t.id}
            href={t.href}
            onClick={(e) => {
              if (onBlock && onBlock(t.href)) e.preventDefault();
            }}
            className={cls}
          >
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
