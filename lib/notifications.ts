import 'server-only';
import { getAdminDb } from './firebase';
import type { NotifyType } from './notifyPrefs';

// In-app notification inbox. EVERY event that triggers a LINE / web push is
// ALSO recorded here, unconditionally (even if the user turned LINE off or
// never added the official account), so the home screen can always show it.
//
// Stored per-user at users/{uid}/notifications/{autoId}. Unread state is a
// single timestamp on the user doc (notifReadAt) — unread = createdAt > that.

export type AppNotification = {
  id: string;
  type: string;
  text: string;
  link?: string;
  createdAt: number;
};

// In-memory fallback for demo / no-Firestore environments.
const mem = new Map<string, AppNotification[]>();

function nextMemId(): string {
  // Date.now is fine on the server (this file is server-only).
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function addNotification(
  userId: string,
  type: NotifyType,
  text: string,
  link?: string,
): Promise<void> {
  if (!userId || !text) return;
  const doc = { type, text: String(text).slice(0, 300), link: link || '', createdAt: Date.now() };
  const db = getAdminDb();
  if (!db) {
    const arr = mem.get(userId) || [];
    arr.unshift({ id: nextMemId(), ...doc });
    mem.set(userId, arr.slice(0, 50));
    return;
  }
  try {
    await db.collection('users').doc(userId).collection('notifications').add(doc);
  } catch (e) {
    console.warn('[notifications] add failed', (e as Error).message);
  }
}

export async function addNotificationMany(
  userIds: string[],
  type: NotifyType,
  text: string,
  link?: string,
): Promise<void> {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  await Promise.all(ids.map((u) => addNotification(u, type, text, link)));
}

export async function listNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  if (!userId) return [];
  const db = getAdminDb();
  if (!db) return (mem.get(userId) || []).slice(0, limit);
  try {
    const snap = await db
      .collection('users').doc(userId).collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as AppNotification[];
  } catch (e) {
    console.warn('[notifications] list failed', (e as Error).message);
    return [];
  }
}
