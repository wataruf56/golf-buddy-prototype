import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';
import { getMeId } from '@/lib/session';

// Lightweight diagnostic to help debug profile-save issues in production.
// Returns the auth state, env presence, and a Firestore round-trip result.
export async function GET() {
  const meId = await getMeId();
  const db = getAdminDb();
  const env = {
    demoMode: isDemoMode,
    hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    privateKeyHasNewline: (process.env.FIREBASE_PRIVATE_KEY || '').includes('\n')
      || (process.env.FIREBASE_PRIVATE_KEY || '').includes('\\n'),
  };

  let firestoreOk = false;
  let firestoreError: string | null = null;
  let userExists: boolean | null = null;
  let userDoc: Record<string, unknown> | null = null;
  if (!isDemoMode && db && meId) {
    try {
      const snap = await db.collection('users').doc(meId).get();
      userExists = snap.exists;
      if (snap.exists) {
        const data = snap.data() || {};
        // Show only safe fields
        userDoc = {
          displayName: data.displayName,
          age: data.age,
          area: data.area,
          scoreRange: data.scoreRange,
          playStyle: data.playStyle,
          frequency: data.frequency,
          avatar: data.avatar,
          hasAvatarUrl: !!data.avatarUrl,
          updatedAt: data.updatedAt,
        };
      }
      const diagRef = db.collection('_diag').doc('ping');
      await diagRef.set({ at: Date.now(), by: meId }, { merge: true });
      const r = await diagRef.get();
      firestoreOk = r.exists;
    } catch (e) {
      firestoreError = (e as Error).message;
    }
  }

  return NextResponse.json({
    meId,
    env,
    firestoreOk,
    firestoreError,
    userExists,
    userDoc,
    serverTime: new Date().toISOString(),
    buildId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
  }, {
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}
