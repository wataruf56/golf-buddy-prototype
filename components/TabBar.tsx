'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Plus, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';

const tabs = [
  { id: 'home', label: 'ホーム', href: '/home', icon: Home },
  { id: 'search', label: 'さがす', href: '/search', icon: Search },
  { id: 'create', label: '募集する', href: '/create', icon: Plus },
  { id: 'buddies', label: 'ゴル友', href: '/buddies', icon: Users },
  { id: 'mypage', label: 'マイページ', href: '/mypage', icon: User },
];

export function TabBar({ onBlock }: { onBlock?: () => boolean }) {
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
        return (
          <Link
            key={t.id}
            href={t.href}
            onClick={(e) => {
              if (onBlock && onBlock()) e.preventDefault();
            }}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-1 -webkit-tap-highlight-color-transparent relative',
              active ? 'text-green' : 'text-muted'
            )}
          >
            <div className="relative">
              <Icon size={26} strokeWidth={2} />
              {badge > 0 && (
                <span className="absolute -top-1 -right-2 bg-red text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className={cn('text-[10px]', active ? 'font-bold' : 'font-medium')}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
