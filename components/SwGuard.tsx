'use client';

import { useEffect } from 'react';

// One-time-per-version cache buster:
// If the stored buster key !== current build, unregister all service workers
// + clear all caches, then reload. This guarantees stale PWA caches don't
// keep serving outdated /api/* responses after a deploy.
const BUSTER_KEY = 'sw-buster-v3';

export function SwGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(BUSTER_KEY);
    if (seen === '1') return;

    let cancelled = false;
    (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        localStorage.setItem(BUSTER_KEY, '1');
        if (!cancelled) location.reload();
      } catch {
        // best-effort
        localStorage.setItem(BUSTER_KEY, '1');
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
