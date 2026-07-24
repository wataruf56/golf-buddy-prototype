'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PhoneFrame } from '@/components/PhoneFrame';
import { TabBar } from '@/components/TabBar';
import { ReviewOverlay } from '@/components/ReviewOverlay';
import { GroupGate } from '@/components/GroupGate';
import { BlockerPopup } from '@/components/BlockerPopup';
import { ToastHost } from '@/components/Toast';
import { ConfirmHost } from '@/components/ConfirmDialog';
import { AgeGateScreen } from '@/components/AgeGateScreen';
import { MatchingBanner } from '@/components/MatchingBanner';
import { UpdateBanner } from '@/components/UpdateBanner';
import { getMe, store, useStore } from '@/lib/store';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

// Routes that don't require matching access (always available, regardless of age)
// /round is included so a friend who opens a shared round URL can read the
// post even before completing profile registration. The "join" button on the
// round page itself enforces the profile gate.
// /poll (日程調整) works the same way: the shared poll must be viewable without
// login/profile, and the answer buttons enforce the profile gate themselves.
const ALWAYS_ALLOWED = ['/guide', '/swing', '/mypage', '/profile', '/admin', '/legal', '/round', '/poll', '/qr', '/add-friend'];

function needsMatchingAccess(pathname: string): boolean {
  if (!pathname) return false;
  return !ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const pathname = usePathname() || '';
  const pendingCount = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending').length
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);

  const matchingAllowed = isMatchingAllowedByAge(me?.age);
  const ageGated = hydrated && needsMatchingAccess(pathname) && !matchingAllowed;
  const banned = useStore((s) => s.banned);
  // 赤バン（アカウント停止）は全画面を遮断（ログイン中でも一切使えない状態にする）。
  const banGated = hydrated && banned;

  useEffect(() => {
    if (pendingCount > 0 && !blockerOpen) setOverlayOpen(true);
    if (pendingCount === 0) {
      setOverlayOpen(false);
      setBlockerOpen(false);
    }
  }, [pendingCount, blockerOpen]);

  // リアルタイム更新：画面遷移・タブ再表示のたびに最新状態を取り込む（招待承認・
  // 参加確定などが、アプリを開き直さなくても反映されるように）。過剰取得を避け
  // 直近4秒はスキップする軽いスロットル付き。
  const lastRefreshRef = useRef(0);
  function refreshData() {
    if (!store.get().hydrated) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 4000) return;
    lastRefreshRef.current = now;
    store.hydrate().catch(() => {});
  }
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabBlock(href?: string) {
    // Allow マイページ even with pending reviews so the user can edit profile
    // or sign out. All other tabs prompt the review popup.
    if (pendingCount > 0 && href !== '/mypage') {
      setBlockerOpen(true);
      setOverlayOpen(false);
      return true;
    }
    return false;
  }

  return (
    <PhoneFrame>
      <UpdateBanner />
      <div className="screen">
        {!hydrated ? (
          <div className="flex flex-col items-center justify-center h-full pt-32">
            <div className="w-12 h-12 rounded-full bg-green-light flex items-center justify-center text-2xl mb-3 animate-pulse">⛳</div>
            <div className="text-xs text-muted">読み込み中...</div>
          </div>
        ) : banGated ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <div className="text-base font-black mb-2">現在ご利用を制限しています</div>
            <div className="text-[13px] text-sub leading-relaxed">
              募集・参加・チャットなどのコミュニティ機能の利用が制限されています。<br />
              お心当たりがない場合は運営までお問い合わせください。
            </div>
          </div>
        ) : ageGated ? (
          <AgeGateScreen age={me?.age} />
        ) : (
          <>
            {/* DM（/chat）は固定ヘッダー＋入力欄でビューポートを使い切る全画面レイアウト。
                コミュニティ帯を出すとその高さぶん下にはみ出して入力欄がタブバーと重なるため、
                チャット画面ではバナーを出さない（年齢ゲート自体は従来どおり有効）。 */}
            {needsMatchingAccess(pathname) && !pathname.startsWith('/chat') && <MatchingBanner />}
            {children}
          </>
        )}
      </div>
      {blockerOpen && pendingCount > 0 && (
        <BlockerPopup onOpen={() => { setBlockerOpen(false); setOverlayOpen(true); }} />
      )}
      {overlayOpen && pendingCount > 0 && <ReviewOverlay />}
      <GroupGate />
      <ToastHost />
      <ConfirmHost />
      <TabBar onBlock={onTabBlock} />
    </PhoneFrame>
  );
}
