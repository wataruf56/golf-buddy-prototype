// ラウンドの「完了確認」を始める時刻（2026-10-11）。主催者への LINE（cron round-reminders）と、
// 画面の閉じられないゲート（components/CompletionGate）は同じ時刻から始める。
// 開催日の 20:00 JST。スタートが14時以降なら翌日の 20:00 JST。
const DAY = 24 * 3600 * 1000;

export function completionDueMs(date: string, startTime: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const tm = /^(\d{1,2}):(\d{2})/.exec(startTime || '');
  if (!dm) return null;
  const startHour = tm ? Number(tm[1]) : 8;
  const base = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], 20 - 9, 0);   // その日の 20:00 JST
  return startHour >= 14 ? base + DAY : base;
}
