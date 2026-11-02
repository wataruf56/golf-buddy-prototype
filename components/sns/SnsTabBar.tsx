'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/Avatar';
import { useStore, getMe } from '@/lib/store';
import { useUnreadCounts } from '@/lib/useUnread';

// インスタ風の下タブのテスト版（2026-11-02 本人指定・運営だけ・components/TabBar から切り替える）。
// ホーム／さがす／DM（真ん中・紙飛行機）／スイング／マイページ（右下）。タイムラインは外し、行ける日はホーム右上の 📅、ゴル友はマイページの中から。
export const SNS_TABS_KEY = 'gb-sns-tabs';

const under = (p: string, base: string) => p === base || p.startsWith(`${base}/`);
const TABS = [
  { id: 'home', label: 'ホーム', href: '/sns', active: (p: string) => p === '/sns' },
  { id: 'search', label: 'さがす', href: '/search', active: (p: string) => under(p, '/search') },
  { id: 'dm', label: 'DM', href: '/sns/dm', active: (p: string) => under(p, '/sns/dm') },
  { id: 'swing', label: 'スイング', href: '/swing', active: (p: string) => under(p, '/swing') },
  // 今のマイページとゴル友はここから入るので、開いている間はマイページのタブを光らせる
  { id: 'me', label: 'マイページ', href: '/sns/u/me', active: (p: string) => under(p, '/sns/u/me') || under(p, '/mypage') || under(p, '/buddies') },
];

function PaperPlane({ active }: { active: boolean }) {
  return (
    <svg width="22" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.6 : 2} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d="M21.5 3 2.8 9.6l7.2 3.3 3.2 7.6z" />
      <path d="M21.5 3 10 12.9" />
    </svg>
  );
}

export function SnsTabBar({ onBlock }: { onBlock?: (href: string) => boolean }) {
  const pathname = usePathname() || '';
  const me = useStore(getMe);
  const { buddiesUnread } = useUnreadCounts();
  const [dmUnread, setDmUnread] = useState(0);
  // テスト版のDMの未読。画面を移るたびに読み直す
  useEffect(() => {
    fetch('/api/sns/dm', { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setDmUnread((j.threads || []).filter((t: { unread?: boolean }) => t.unread).length); }).catch(() => {});
  }, [pathname]);
  // マイページのバッジは今のDMの未読（これまでゴル友のタブに出ていたもの）
  const badges: Record<string, number> = { dm: dmUnread, me: buddiesUnread };

  return (
    <div className="tab-bar h-[82px] bg-card border-t-2 border-border flex items-start pt-2 flex-shrink-0">
      {TABS.map((t) => {
        const active = t.active(pathname);
        const badge = active ? 0 : (badges[t.id] || 0);
        return (
          <Link key={t.id} href={t.href} onClick={(e) => { if (onBlock && onBlock(t.href)) e.preventDefault(); }}
            className={cn('flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1 relative', active ? 'text-green' : 'text-muted')}>
            <div className={cn('relative px-2 py-0.5 rounded-full transition-colors text-[20px] leading-none h-[24px] flex items-center justify-center', active && 'bg-green-light')}>
              {t.id === 'home' && <span>🏠</span>}
              {t.id === 'search' && <span>🔍</span>}
              {t.id === 'dm' && <PaperPlane active={active} />}
              {t.id === 'swing' && <span>🏌️</span>}
              {t.id === 'me' && <span className={cn('rounded-full', active && 'ring-2 ring-green')}><Avatar user={me} size={22} /></span>}
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1" aria-label={`新着${badge}件`}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
            <span className={cn('text-[9px] whitespace-nowrap tracking-tighter text-center leading-[1.15] min-h-[21px]', active ? 'font-bold' : 'font-medium')}>{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
