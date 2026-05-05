'use client';

/** Fire-and-forget client telemetry. Records events to /api/log so we can
 *  inspect what happened on the user's phone after the fact.
 */
export function track(event: string, data?: unknown) {
  if (typeof window === 'undefined') return;
  const page = location.pathname;
  const body = JSON.stringify({ event, data, page });
  // Use sendBeacon if available (survives page navigations), else fetch.
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if ('sendBeacon' in navigator && navigator.sendBeacon('/api/log', blob)) return;
  } catch {}
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
