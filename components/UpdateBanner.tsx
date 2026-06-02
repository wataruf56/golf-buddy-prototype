'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CURRENT_BUILD, fetchLatestVersion, forceUpdate } from '@/lib/appUpdate';

// Shows a banner when a newer version has been deployed than the one the user
// currently has loaded. Tapping "更新する" clears caches + service workers and
// reloads with a cache-busting query so even an aggressive in-app webview
// (LINE LIFF / WKWebView) picks up the new build — no app restart needed.
export function UpdateBanner() {
  const pathname = usePathname() || '';
  const [latest, setLatest] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!CURRENT_BUILD || CURRENT_BUILD === 'dev') return; // unknown/local build → never nag
    const v = await fetchLatestVersion();
    if (v) setLatest(v);
  }, []);

  useEffect(() => {
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(iv);
    };
  }, [check]);

  const updateAvailable =
    CURRENT_BUILD !== 'dev' && !!latest && latest !== 'dev' && latest !== CURRENT_BUILD;
  // Home renders its own prominent update card (HomeUpdateCard), so suppress the
  // top bar there to avoid a redundant double prompt.
  if (!updateAvailable || pathname.startsWith('/home')) return null;

  async function onClick() {
    setBusy(true);
    await forceUpdate(latest);
  }

  return (
    <div className="flex-shrink-0 bg-green text-white px-4 py-2.5 flex items-center justify-between gap-3 z-[120]">
      <div className="min-w-0">
        <div className="text-[12px] font-bold leading-tight">🎉 新しいバージョンがあります</div>
        <div className="text-[10px] font-medium opacity-90 leading-tight mt-0.5">
          タップして最新の状態に更新できます
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={busy}
        className="flex-shrink-0 bg-white text-green text-[12px] font-black px-4 py-1.5 rounded-full shadow-sm disabled:opacity-60"
      >
        {busy ? '更新中…' : '更新する'}
      </button>
    </div>
  );
}
