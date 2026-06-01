'use client';

// Client helpers for enabling browser/web push. Registers a dedicated push
// service worker (/push-sw.js), requests Notification permission, subscribes
// to PushManager with our VAPID public key, and POSTs the subscription to
// the server.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-key' | 'error'; message?: string };

/**
 * Full enable flow: register SW → request permission → subscribe → save.
 * Returns a structured result so the UI can show the right message.
 */
export async function enableWebPush(): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    // 1. Get the VAPID public key from the server.
    const keyRes = await fetch('/api/push/subscribe', { cache: 'no-store' });
    const { vapidPublicKey } = await keyRes.json();
    if (!vapidPublicKey) return { ok: false, reason: 'no-key' };

    // 2. Request notification permission.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    // 3. Register the push service worker.
    const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;

    // 4. Subscribe (reuse existing subscription if present).
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: BufferSource typing varies across TS lib versions.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
    }

    // 5. Persist to server.
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!res.ok) return { ok: false, reason: 'error', message: `save ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message };
  }
}

/** Disable: unsubscribe locally and tell the server to drop it. */
export async function disableWebPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {/* noop */}
}
