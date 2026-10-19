'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';
import { useStore } from '@/lib/store';
import { userViewCohort } from '@/lib/ageGate';
import { useAvailBadge } from '@/lib/availBadge';

// モック準拠のタブ（2026-10-08 タイムライン、2026-10-11 過去ラウンド、2026-10-14 行ける日を追加）（絵文字アイコン・クリーム地・インク枠・アクティブはティール）。
// 「募集」はホームのタイルから、「マイ」はホームのプロフィールカードから到達する。
// 「行ける日」は左から2番目（2026-10-14 本人指定。それまではホームの大きなカードだった）。20〜30代にだけ出す（lib/availability と同じ）。
//   ほかの人が新しく押した日があると①②のバッジ（lib/availBadge）。タブを開くと消える。
// 2行に折る名前（8タブのときは「タイムライン」「過去ラウンド」を折っていた。2026-10-17 から6タブなので1行で入る）。
const TWO_LINE: Record<string, [string, string]> = {};

type Tab = { id: string; label: string; href: string; emoji: string; external?: boolean };

const tabs: Tab[] = [
  { id: 'home', label: 'ホーム', href: '/home', emoji: '🏠' },
  { id: 'avail', label: '行ける日', href: '/availability', emoji: '📅' },
  { id: 'search', label: 'さがす', href: '/search', emoji: '🔍' },
  { id: 'timeline', label: 'タイムライン', href: '/timeline', emoji: '📰' },
  // 2026-10-17：「過去ラウンド」と「使い方」は下のタブから外してマイページへ（本人指定）。
  //   過去ラウンド＝マイページの「🏁 過去のラウンド」（/rounds/past も残す）／使い方＝マイページの「📖 使い方」＋初回だけポップアップ（GuideIntroPopup）
  { id: 'swing', label: 'スイング', href: '/swing', emoji: '🏌️' },
  { id: 'buddies', label: 'ゴル友', href: '/buddies', emoji: '👥' },
];

export function TabBar({ onBlock }: { onBlock?: (href: string) => boolean }) {
  const pathname = usePathname();
  const { buddiesUnread } = useUnreadCounts();
  const availNew = useAvailBadge();
  const meU = useStore((s) => s.users.find((u) => u.id === s.meId));
  const showAvail = userViewCohort(meU as any) === 'a';   // 運営が特例にした40歳以上の人も（2026-10-20）
  const tabBadges: Record<string, number> = { buddies: buddiesUnread, avail: availNew };
  // 行ける日は1日1件で数えるので2桁になりやすい。99+ まで出す（ほかは従来どおり 9+）
  const badgeCap: Record<string, number> = { avail: 99 };

  return (
    <div className="tab-bar h-[82px] bg-card border-t-2 border-border flex items-start pt-2 flex-shrink-0">
      {tabs.filter((t) => t.id !== 'avail' || showAvail).map((t) => {
        const active = pathname?.startsWith(t.href);
        // 開いているタブにはバッジを出さない（見ている最中に増えた分は、次に開いたとき既読になる）
        const badge = active ? 0 : (tabBadges[t.id] || 0);
        const cap = badgeCap[t.id] || 9;
        const cls = cn(
          'flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1 relative',
          active ? 'text-green' : 'text-muted',
        );
        const inner = (
          <>
            <div className={cn('relative px-2 py-0.5 rounded-full transition-colors text-[20px] leading-none', active && 'bg-green-light')}>
              <span>{t.emoji}</span>
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red text-white text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1"
                  aria-label={`新着${badge}件`}>
                  {badge > cap ? `${cap}+` : badge}
                </span>
              )}
            </div>
            {/* 長い名前は2行に。高さは全タブそろえる（2026-10-13・2026-10-14 からはどの幅でも） */}
            <span className={cn('text-[9px] whitespace-nowrap tracking-tighter text-center leading-[1.15] min-h-[21px]', active ? 'font-bold' : 'font-medium')}>
              {TWO_LINE[t.id] ? <>{TWO_LINE[t.id][0]}<br />{TWO_LINE[t.id][1]}</> : t.label}
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
