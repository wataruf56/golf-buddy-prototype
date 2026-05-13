import 'server-only';
import { getAdminDb } from './firebase';
import type { SwingDoc } from '@/types/swing';

// Top-level collection: `swings/{swingId}`.
// Each doc has `userId` for filtering. Single-collection queries don't need
// composite indexes (where + limit on a single equality field works out of box).

const COL = 'swings';

function stripUndefined<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export async function createSwing(doc: SwingDoc): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const data = stripUndefined({ ...doc });
  await db.collection(COL).doc(doc.swingId).set(data);
}

export async function getSwing(userId: string, swingId: string): Promise<SwingDoc | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection(COL).doc(swingId).get();
  if (!snap.exists) return null;
  const data = snap.data() as SwingDoc;
  // Defensive: enforce ownership at read time.
  if (data.userId !== userId) return null;
  return data;
}

export async function updateSwing(userId: string, swingId: string, patch: Partial<SwingDoc>): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const data = stripUndefined({ ...patch, updatedAt: Date.now() });
  await db.collection(COL).doc(swingId).set(data, { merge: true });
}

export async function listSwingsForUser(userId: string, limit = 50): Promise<SwingDoc[]> {
  const db = getAdminDb();
  if (!db) return [];
  try {
    // Avoid composite index: filter only, sort in app code.
    const snap = await db
      .collection(COL)
      .where('userId', '==', userId)
      .limit(limit * 2)
      .get();
    const docs = snap.docs.map((d: any) => d.data() as SwingDoc);
    docs.sort((a: SwingDoc, b: SwingDoc) => (b.createdAt || 0) - (a.createdAt || 0));
    return docs.slice(0, limit);
  } catch (e) {
    console.error('[listSwingsForUser]', e);
    return [];
  }
}

/** Worker: pick up to N queued swings + reclaim stuck `analyzing` ones. */
export async function listQueuedSwings(limit = 3): Promise<SwingDoc[]> {
  const db = getAdminDb();
  if (!db) return [];
  // Stuck = analyzing for >2 min. The Cloud Run analyzer typically returns
  // in 30〜60s; anything over 2 minutes almost certainly means the previous
  // tick crashed mid-flight (Vercel timeout, lost network, etc) and we
  // should re-queue. Was 5 min before, which kept users waiting a long
  // time on the rare crash.
  const STUCK_MS = 2 * 60 * 1000;

  // Reclaim stuck 'analyzing' docs first.
  try {
    const stuckSnap = await db
      .collection(COL)
      .where('status', '==', 'analyzing')
      .limit(limit)
      .get();
    const now = Date.now();
    for (const d of stuckSnap.docs) {
      const data = d.data();
      const startedAt = data.startedAnalyzingAt || 0;
      if (startedAt && now - startedAt > STUCK_MS) {
        await d.ref.set({ status: 'queued', analysisRunId: '', updatedAt: now, errorMessage: 'reclaimed_stuck_analyzing' }, { merge: true });
      }
    }
  } catch (e) {
    console.error('[listQueuedSwings reclaim]', e);
  }

  try {
    const snap = await db
      .collection(COL)
      .where('status', '==', 'queued')
      .limit(limit)
      .get();
    return snap.docs.map((d: any) => d.data() as SwingDoc);
  } catch (e) {
    console.error('[listQueuedSwings]', e);
    return [];
  }
}
