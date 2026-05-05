'use client';

import { useEffect, useState } from 'react';
import { PhoneFrame } from '@/components/PhoneFrame';
import { TabBar } from '@/components/TabBar';
import { ReviewOverlay } from '@/components/ReviewOverlay';
import { BlockerPopup } from '@/components/BlockerPopup';
import { useStore } from '@/lib/store';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const pendingCount = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending').length
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);

  useEffect(() => {
    if (pendingCount > 0 && !blockerOpen) setOverlayOpen(true);
    if (pendingCount === 0) {
      setOverlayOpen(false);
      setBlockerOpen(false);
    }
  }, [pendingCount, blockerOpen]);

  function onTabBlock() {
    if (pendingCount > 0) {
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
        ) : (
          children
        )}
      </div>
      {blockerOpen && pendingCount > 0 && (
        <BlockerPopup onOpen={() => { setBlockerOpen(false); setOverlayOpen(true); }} />
      )}
      {overlayOpen && pendingCount > 0 && <ReviewOverlay />}
      <TabBar onBlock={onTabBlock} />
    </PhoneFrame>
  );
}
