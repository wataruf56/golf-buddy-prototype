import { isDemoMode } from './auth';

let adminDb: unknown = null;

export function getAdminDb() {
  if (isDemoMode) return null;
  if (adminDb) return adminDb;
  if (typeof window !== 'undefined') return null;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    adminDb = admin.firestore();
    return adminDb;
  } catch (e) {
    console.warn('[firebase] admin not initialized:', e);
    return null;
  }
}
