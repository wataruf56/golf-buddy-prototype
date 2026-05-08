import 'server-only';
import { getAdminDb } from './firebase';
import type { SwingDoc, SwingStatus } from '@/types/swing';

// Path: users/{userId}/swings/{swingId}
// Top-level lookup (worker queue): collectionGroup('swings').where('status', '==', 'queued')
// We also mirror status+createdAt at top-level `_swingsIndex/{swingId}` for cheap query
// without composite indexes — but if collectionGroup is acceptable, prefer that.

function stripUndefined<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export async function createSwing(doc: SwingDoc): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const data = stripUndefined({ ...doc });
  await db.collection('users').doc(doc.userId).collection('swings').doc(doc.swingId).set(data);
}

export async function getSwing(userId: string, swingId: string): Promise<SwingDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection('users').doc(userId).collection('swings').doc(swingId).get();
  if (!snap.exists) return null;
  return snap.data() as SwingDoc;
}

export async function updateSwing(userId: string, swingId: string, patch: Partial<SwingDoc>): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const data = stripUndefined({ ...patch, updatedAt: Date.now() });
  await db.collection('users').doc(userId).collection('swings').doc(swingId).set(data, { merge: true });
}

export async function listSwingsForUser(userId: string, limit = 50): Promise<SwingDoc[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const snap = await db
      .collection('users').doc(userId)
      .collection('swings')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d: any) => d.data() as SwingDoc);
  } catch (e) {
    console.error('[listSwingsForUser]', e);
    return [];
  }
}

/** Worker: pick up to N queued swings across all users. */
export async function listQueuedSwings(limit = 3): Promise<SwingDoc[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    const snap = await db
      .collectionGroup('swings')
      .where('status', '==', 'queued')
      .limit(limit)
      .get();
    return snap.docs.map((d: any) => d.data() as SwingDoc);
  } catch (e) {
    console.error('[listQueuedSwings]', e);
    return [];
  }
}
