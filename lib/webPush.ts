import 'server-only';
import webpush from 'web-push';
import { getAdminDb } from './firebase';

// Web Push (VAPID) sender. Mirrors lib/linePush so call sites can fire both
// LINE and web-push for the same event. Subscriptions are stored per user in
// Firestore: collection "pushSubscriptions", doc id = userId, field
// `subs` = array of PushSubscription JSON objects (a user may have several
// devices). Dead subscriptions (410/404) are pruned on send.

const COL = 'pushSubscriptions';

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@goltomo.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/** Save (upsert) a subscription for a user. De-dups by endpoint. */
export async function saveSubscription(userId: string, sub: PushSub): Promise<void> {
  const db = getAdminDb();
  if (!db || !userId || !sub?.endpoint) return;
  const ref = db.collection(COL).doc(userId);
  const snap = await ref.get();
  const existing: PushSub[] = (snap.exists && snap.data()?.subs) || [];
  const next = existing.filter((s) => s.endpoint !== sub.endpoint);
  next.push(sub);
  // Cap at 10 devices per user.
  await ref.set({ subs: next.slice(-10), updatedAt: Date.now() }, { merge: true });
}

/** Remove a subscription (e.g. user revoked permission / unsubscribed). */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  const db = getAdminDb();
  if (!db || !userId) return;
  const ref = db.collection(COL).doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const existing: PushSub[] = snap.data()?.subs || [];
  await ref.set({ subs: existing.filter((s) => s.endpoint !== endpoint) }, { merge: true });
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

/**
 * Send a web push to all of a user's devices. Best-effort, never throws.
 * Prunes subscriptions that the push service reports as gone (404/410).
 */
export async function webPushTo(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const db = getAdminDb();
  if (!db || !userId) return;
  const ref = db.collection(COL).doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const subs: PushSub[] = snap.data()?.subs || [];
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub as any, body);
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) dead.push(sub.endpoint);
        else console.warn('[webPush] send failed', code, (e?.message || '').slice(0, 120));
      }
    }),
  );
  if (dead.length) {
    await ref.set({ subs: subs.filter((s) => !dead.includes(s.endpoint)) }, { merge: true });
  }
}

/** Convenience: text-style call matching linePush.pushTo(userId, text, link). */
export async function webPushText(userId: string, title: string, body: string, url?: string, tag?: string): Promise<void> {
  await webPushTo(userId, { title, body, url, tag });
}

/** Send the same payload to many users (matches linePush.pushToMany). */
export async function webPushToMany(userIds: string[], title: string, body: string, url?: string, tag?: string): Promise<void> {
  const ids = (userIds || []).filter(Boolean);
  await Promise.all(ids.map((id) => webPushTo(id, { title, body, url, tag }).catch(() => {})));
}
