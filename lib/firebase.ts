import 'server-only';
import { isDemoMode } from './demoMode';

let _adminApp: any = null;
let _adminDb: any = null;

export function getAdminDb(): any | null {
  if (isDemoMode) return null;
  if (_adminDb) return _adminDb;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      _adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    } else {
      _adminApp = admin.apps[0];
    }
    _adminDb = admin.firestore();
    return _adminDb;
  } catch (e) {
    console.error('[firebase] admin init failed:', e);
    return null;
  }
}
