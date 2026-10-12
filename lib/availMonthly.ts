import 'server-only';
import { getAdminDb } from './firebase';
import { viewCohort } from './ageGate';
import type { User } from './types';
import { isMarketingPopupEligible } from './popupEligibility';

// 毎月の「行ける日を入れませんか？」（2026-10-12）。
// 月末の2日前（10月なら10/29、9月なら9/28）から月末まで、**翌月と翌々月の行ける日を1日も入れていない**会員に
//   ・ポップアップ（components/AvailMonthlyPopup・ほかのポップアップとは重ならない＝lib/popupSlot）
//   ・LINE（月末2日前の12:00以降に1回だけ・housekeeping の cron）
// ポップアップは「閉じる」を押してもその月のうちはもう出さない（users.availMonthlySeen[月]）。入力したら出ない。
// 対象：20〜30代（行ける日の対象）・停止中でない。テスト垢はテスト垢にだけ（LINE はテスト垢には飛ばない）。
const JST = 9 * 3600 * 1000;

function jstParts(ms: number) {
  const d = new Date(ms + JST);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m は1〜12
const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

/** いまがお知らせの期間（月末の2日前〜月末）か。期間なら { key: 'YYYY-MM', months: [翌月, 翌々月] } */
export function monthlyWindow(now = Date.now()): { key: string; months: string[]; isFirstDay: boolean; hour: number } | null {
  const { y, m, day, hour } = jstParts(now);
  const last = lastDayOf(y, m);
  if (day < last - 2) return null;
  const n1 = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const n2 = n1.m === 12 ? { y: n1.y + 1, m: 1 } : { y: n1.y, m: n1.m + 1 };
  return { key: ym(y, m), months: [ym(n1.y, n1.m), ym(n2.y, n2.m)], isFirstDay: day === last - 2, hour };
}

const label = (k: string) => `${Number(k.slice(5, 7))}月`;
export function monthlyTexts(months: string[]) {
  const mm = months.map(label).join('・');
  return {
    title: '行ける日を入力して、\n合いそうな人たちで一緒にラウンド行きませんか？',
    body: `${mm}の「行ける日」がまだ入っていません。日付を押しておくだけで、同じ日に行ける人が3人そろうとその日のチャットが始まります。`,
    line: `📅【ゴルトモ】行ける日を入力して、合いそうな人たちで一緒にラウンド行きませんか？\n${mm}の行ける日を入れておくと、同じ日に行ける人とラウンドを組みやすくなります。`,
  };
}

async function hasDatesIn(userId: string, months: string[]): Promise<boolean> {
  const { getAvailability } = await import('./availability');
  const dates = (await getAvailability(userId))?.dates || [];
  return dates.some((d) => months.some((m) => d.startsWith(m)));
}

/** いまこの人にポップアップを出すか */
export async function monthlyPromptFor(me: User): Promise<{ key: string; months: string[]; title: string; body: string } | null> {
  const w = monthlyWindow();
  if (!w) return null;
  if (viewCohort(me.age) !== 'a' || (me as any).banned) return null;
  // プロフィール登録から24時間たっていない人には出さない（見た印も付けない）（lib/popupEligibility）
  if (!isMarketingPopupEligible(me)) return null;
  if (((me as any).availMonthlySeen || {})[w.key]) return null;
  if (await hasDatesIn(me.id, w.months)) return null;
  const t = monthlyTexts(w.months);
  return { key: w.key, months: w.months, title: t.title, body: t.body };
}

export async function markMonthlySeen(userId: string, key: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !userId || !key) return;
  await adb.collection('users').doc(userId).set({ availMonthlySeen: { [key]: Date.now() } }, { merge: true });
}

/** cron：月末2日前の12:00以降に1回だけ、対象の全員へ LINE（＋アプリ内のお知らせ） */
export async function sendMonthlyAvailLine(): Promise<{ sent: number; skipped?: string }> {
  const w = monthlyWindow();
  if (!w || !w.isFirstDay) return { sent: 0, skipped: 'not_day' };
  if (w.hour < 12) return { sent: 0, skipped: 'before_noon' };
  const adb = getAdminDb() as any;
  if (!adb) return { sent: 0, skipped: 'no_db' };
  const ref = adb.collection('_config').doc('availMonthly');
  const cur = (await ref.get()).data() || {};
  if (cur.lastSentKey === w.key) return { sent: 0, skipped: 'already' };
  await ref.set({ lastSentKey: w.key, lastSentAt: Date.now() }, { merge: true });   // 先に印（二重送信しない）

  const { getAvailability } = await import('./availability');
  const usersSnap = await adb.collection('users').limit(5000).get();
  const t = monthlyTexts(w.months);
  const link = '/availability';
  const { pushTo, liffUrl } = await import('./linePush');
  const { addNotification } = await import('./notifications');
  let sent = 0;
  for (const d of usersSnap.docs) {
    const u = { id: d.id, ...(d.data() || {}) } as any;
    if (u.banned || u.isSystem || viewCohort(u.age) !== 'a') continue;
    // プロフィール未登録・登録から24時間たっていない人には送らない（lib/popupEligibility）
    if (!isMarketingPopupEligible(u)) continue;
    const dates: string[] = (await getAvailability(u.id).catch(() => null))?.dates || [];
    if (dates.some((x) => w.months.some((m) => x.startsWith(m)))) continue;
    await addNotification(u.id, 'roundUpcoming', '📅 行ける日を入力して、合いそうな人たちで一緒にラウンド行きませんか？', link).catch(() => {});
    await pushTo(u.id, t.line, liffUrl(link), 'availMonthly').catch(() => {});
    sent += 1;
  }
  await ref.set({ lastSentCount: sent }, { merge: true });
  return { sent };
}
