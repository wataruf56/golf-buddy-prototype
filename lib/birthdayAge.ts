import 'server-only';
import { getAdminDb } from './firebase';
import { ageFromBirthday, parseBirthday } from './ageGate';

// 誕生日から年齢を保存し直す（2026-10-20）。毎日の見回り（cron/housekeeping）から呼ぶ。
// 年代の判定（lib/ageGate.userCohort）と db.getUser / listUsers は誕生日からその場で数えるので、これが無くても見え方は正しい。
// ただ users を直接読んでいる所（一覧・集計・管理画面の一部）は保存された age を使うので、誕生日が来たらここでそろえる。
export async function syncAgesFromBirthday(now = Date.now()): Promise<Record<string, unknown>> {
  const adb = getAdminDb() as any;
  if (!adb) return { skipped: 'no_db' };
  const snap = await adb.collection('users').where('birthday', '>', '').limit(5000).get();
  let updated = 0;
  for (const d of snap.docs) {
    const u = d.data() || {};
    if (!parseBirthday(u.birthday)) continue;
    const age = ageFromBirthday(u.birthday, now);
    if (age > 0 && age !== Number(u.age || 0)) {
      await d.ref.set({ age, updatedAt: now }, { merge: true });
      updated++;
    }
  }
  return { ok: true, checked: snap.size, updated };
}
