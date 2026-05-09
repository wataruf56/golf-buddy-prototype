'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PhoneFrame } from '@/components/PhoneFrame';
import { TabBar } from '@/components/TabBar';
import { ReviewOverlay } from '@/components/ReviewOverlay';
import { BlockerPopup } from '@/components/BlockerPopup';
import { ToastHost } from '@/components/Toast';
import { AgeGateScreen } from '@/components/AgeGateScreen';
import { MatchingBanner } from '@/components/MatchingBanner';
import { getMe, useStore } from '@/lib/store';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

// Routes that don't require matching access (always available, regardless of age)
const ALWAYS_ALLOWED = ['/swing', '/mypage', '/profile', '/admin', '/legal'];

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

  useEffect(() => {
    if (pendingCount > 0 && !blockerOpen) setOverlayOpen(true);
    if (pendingCount === 0) {
      setOverlayOpen(false);
      setBlockerOpen(false);
    }
  }, [pendingCount, blockerOpen]);

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
      <div className="screen">
        {!hydrated ? (
          <div className="flex flex-col items-center justify-center h-full pt-32">
            <div className="w-12 h-12 rounded-full bg-green-light flex items-center justify-center text-2xl mb-3 animate-pulse">⛳</div>
            <div className="text-xs text-muted">読み込み中...</div>
          </div>
        ) : ageGated ? (
          <AgeGateScreen age={me?.age} />
        ) : (
          <>
            {needsMatchingAccess(pathname) && <MatchingBanner />}
            {children}
          </>
        )}
      </div>
      {blockerOpen && pendingCount > 0 && (
        <BlockerPopup onOpen={() => { setBlockerOpen(false); setOverlayOpen(true); }} />
      )}
      {overlayOpen && pendingCount > 0 && <ReviewOverlay />}
      <ToastHost />
      <TabBar onBlock={onTabBlock} />
    </PhoneFrame>
  );
}
