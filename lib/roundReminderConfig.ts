import 'server-only';
import { getAdminDb } from './firebase';

// 開催前リマインドを「開催の何日前に送るか」の設定。管理画面から編集でき、
// cron(upcoming-reminders)が参照する。Firestore: _config/roundReminders。
export const DEFAULT_DAYS_BEFORE = [30, 7, 1];

function clean(days: any[]): number[] {
  const arr = (Array.isArray(days) ? days : [])
    .map((n) => parseInt(String(n), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 120);
  return Array.from(new Set(arr)).sort((a, b) => b - a);
}

export async function getReminderDaysBefore(): Promise<number[]> {
  const db = getAdminDb() as any;
  if (!db) return DEFAULT_DAYS_BEFORE;
  try {
    const s = await db.collection('_config').doc('roundReminders').get();
    if (s.exists && Array.isArray(s.data()?.daysBefore)) {
      const c = clean(s.data().daysBefore);
      return c.length ? c : [];
    }
  } catch { /* fall through */ }
  return DEFAULT_DAYS_BEFORE;
}

export async function setReminderDaysBefore(days: any[]): Promise<number[]> {
  const db = getAdminDb() as any;
  if (!db) throw new Error('firestore not initialized');
  const c = clean(days);
  await db.collection('_config').doc('roundReminders').set({ daysBefore: c, updatedAt: Date.now() }, { merge: true });
  return c;
}
