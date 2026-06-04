// Shared "force the app to the latest deploy" routine, used by both the
// auto-detect UpdateBanner and the always-available manual button in mypage.
//
// It unregisters any service worker, clears the Cache Storage API, then reloads
// with a cache-busting query param so even an aggressive in-app webview
// (LINE LIFF / WKWebView) fetches fresh HTML pointing at the new build's
// hashed JS chunks — no app/LINE restart required.

// Human-friendly version shown to users. Bump this manually when you cut a
// meaningful release (e.g. '2.1' → '2.2'). This is ONLY for display.
//
// IMPORTANT: update *detection* still uses CURRENT_BUILD (the git SHA, which
// changes on every deploy) so the "new version available" banner keeps working
// even between releases that share the same display version. Don't switch the
// detection to APP_VERSION or back-to-back deploys won't be detected.
export const APP_VERSION = '4.0';

// Per-deploy build id (git SHA), baked at build time. Used for update detection.
export const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.version ? String(d.version) : null;
  } catch {
    return null;
  }
}

export async function forceUpdate(targetVersion?: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best-effort */
  }
  // A unique-but-stable buster: the target build id if known, else a timestamp.
  const buster = targetVersion || (await fetchLatestVersion()) || String(Date.now());
  try {
    const u = new URL(window.location.href);
    u.searchParams.set('_v', buster);
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}
