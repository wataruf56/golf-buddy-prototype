'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Plus, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'home', label: 'ホーム', href: '/home', icon: Home },
  { id: 'search', label: 'さがす', href: '/search', icon: Search },
  { id: 'create', label: '募集する', href: '/create', icon: Plus },
  { id: 'buddies', label: 'ゴル友', href: '/buddies', icon: Users },
  { id: 'mypage', label: 'マイページ', href: '/mypage', icon: User },
];

export function TabBar({ onBlock }: { onBlock?: () => boolean }) {
  const pathname = usePathname();
  return (
    <div className="tab-bar h-[82px] bg-card border-t border-border flex items-start pt-2 flex-shrink-0">
      {tabs.map((t) => {
        const active = pathname?.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            onClick={(e) => {
              if (onBlock && onBlock()) e.preventDefault();
            }}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-1 -webkit-tap-highlight-color-transparent',
              active ? 'text-green' : 'text-muted'
            )}
          >
            <Icon size={26} strokeWidth={2} />
            <span className={cn('text-[10px]', active ? 'font-bold' : 'font-medium')}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
