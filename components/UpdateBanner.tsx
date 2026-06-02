'use client';

import { useCallback, useEffect, useState } from 'react';

// The build this client bundle was compiled from (baked at build time via
// Dockerfile ARG → NEXT_PUBLIC_BUILD_ID = git SHA). Empty in local dev.
const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || '';

// Shows a banner when a newer version has been deployed than the one the user
// currently has loaded. Tapping "更新する" clears caches + service workers and
// reloads with a cache-busting query so even an aggressive in-app webview
// (LINE LIFF / WKWebView) picks up the new build. This makes updates reliable
// regardless of CDN or device HTTP caching.
export function UpdateBanner() {
  const [latest, setLatest] = useState('');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!BUILD) return; // unknown/local build → never nag
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      if (d?.version) setLatest(String(d.version));
    } catch {
      /* offline / transient — ignore */
    }
  }, []);

  useEffect(() => {
    check();
    // Re-check when the user returns to the app (common in LIFF) and every 5 min.
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(iv);
    };
  }, [check]);

  const updateAvailable = !!BUILD && !!latest && latest !== 'dev' && latest !== BUILD;
  if (!updateAvailable) return null;

  async function doUpdate() {
    setBusy(true);
    try {
      // Drop any service worker so it can't keep serving cached assets.
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      // Clear the Cache Storage API (PWA caches, if any).
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* best-effort */
    }
    // Reload with a cache-busting param so the webview fetches fresh HTML
    // (which references the new build's hashed JS chunks). Setting it to the
    // target version keeps the URL stable across repeated updates.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('_v', latest);
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
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
        onClick={doUpdate}
        disabled={busy}
        className="flex-shrink-0 bg-white text-green text-[12px] font-black px-4 py-1.5 rounded-full shadow-sm disabled:opacity-60"
      >
        {busy ? '更新中…' : '更新する'}
      </button>
    </div>
  );
}
