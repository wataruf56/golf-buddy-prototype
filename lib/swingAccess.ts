import 'server-only';
import { getAdminDb } from './firebase';

// Whitelist gate for the swing analysis feature.
// Two sources, OR'd together:
//   1) Env `SWING_ALLOWED_USER_IDS` (comma-separated) — for emergency/initial seeding
//   2) Firestore `_swingAccess/allowed` doc with `{ userIds: string[] }` — toggleable from /admin
// SWING_ALLOW_ALL=true bypasses everything (post-beta).
//
// We cache the Firestore lookup for 30s to keep request latency low.

let _cache: { ids: Set<string>; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

async function getFirestoreAllowed(): Promise<Set<string>> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.ids;
  const db = getAdminDb();
  if (!db) return new Set();
  try {
    const snap = await db.collection('_swingAccess').doc('allowed').get();
    const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
    const ids = new Set(arr);
    _cache = { ids, ts: Date.now() };
    return ids;
  } catch {
    return _cache?.ids || new Set();
  }
}

export function invalidateSwingAccessCache(): void {
  _cache = null;
}

function envIds(): Set<string> {
  const raw = process.env.SWING_ALLOWED_USER_IDS || '';
  if (!raw.trim()) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export async function isSwingAllowed(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if ((process.env.SWING_ALLOW_ALL || '').toLowerCase() === 'true') return true;
  if (envIds().has(userId)) return true;
  const fs = await getFirestoreAllowed();
  return fs.has(userId);
}

/** Synchronous variant (env only) — used in places where async is awkward. */
export function isSwingAllowedEnv(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if ((process.env.SWING_ALLOW_ALL || '').toLowerCase() === 'true') return true;
  return envIds().has(userId);
}

export async function setSwingAllowed(userId: string, allowed: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const ref = db.collection('_swingAccess').doc('allowed');
  const snap = await ref.get();
  const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
  const set = new Set(arr);
  if (allowed) set.add(userId); else set.delete(userId);
  await ref.set({ userIds: Array.from(set), updatedAt: Date.now() }, { merge: true });
  invalidateSwingAccessCache();
}

export async function listSwingAllowed(): Promise<string[]> {
  const fs = await getFirestoreAllowed();
  // Merge env + firestore for display
  const all = new Set<string>([...Array.from(envIds()), ...Array.from(fs)]);
  return Array.from(all);
}
