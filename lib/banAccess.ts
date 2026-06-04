import 'server-only';
import { getAdminDb } from './firebase';

// "赤バン" — admin block for the community/matching features (募集・参加・
// チャット・気になる・招待・DM・レビュー). Mirrors lib/swingAccess but as a
// DENY-list. Stored in Firestore `_banAccess/banned` { userIds: string[] }.
// Cached 30s for low latency.

let _cache: { ids: Set<string>; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

async function getBannedSet(): Promise<Set<string>> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.ids;
  const db = getAdminDb();
  if (!db) return new Set();
  try {
    const snap = await db.collection('_banAccess').doc('banned').get();
    const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
    const ids = new Set(arr);
    _cache = { ids, ts: Date.now() };
    return ids;
  } catch {
    return _cache?.ids || new Set();
  }
}

export function invalidateBanCache(): void { _cache = null; }

export async function isBanned(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const ids = await getBannedSet();
  return ids.has(userId);
}

export async function setBanned(userId: string, banned: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const ref = db.collection('_banAccess').doc('banned');
  const snap = await ref.get();
  const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
  const set = new Set(arr);
  if (banned) set.add(userId); else set.delete(userId);
  await ref.set({ userIds: Array.from(set), updatedAt: Date.now() }, { merge: true });
  invalidateBanCache();
}

export async function listBanned(): Promise<string[]> {
  const fs = await getBannedSet();
  return Array.from(fs);
}
