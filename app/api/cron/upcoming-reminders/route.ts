import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getReminderDaysBefore } from '@/lib/roundReminderConfig';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// 開催「前」のお知らせ（2026-10-12 作り直し）。housekeeping cron（15分ごと）から呼ばれる。
//
// 以前は開催の◯日前（既定 30/7/1）の 0:00 すぎに、参加者へ LINE を直接送っていた。
// いまは **その募集のグループチャットに運営（管理人）が「@全員」で書き込む**（本人指定）。
// 通知はふつうのメンションと同じ（アプリ内お知らせ＋通知設定「メンション」がONならLINE）。
// 送るのは JST **12:00 以降**（お昼に統一）。
//
// 書き込むもの（どれも1回だけ。round.upcomingRemindersSent[key] に時刻を記録）
//   d{N}         … 開催の N 日前（管理画面の設定。既定 30/7/1）「1週間前になりました！ピックアップや入金などの確認を」
//   cancel_{ms}  … キャンセル期限の日（期限が12時より前なら前日）「本日◯時がキャンセル期限です」
//   pay3_{ms}    … 入金期日の3日前
//   pay0_{ms}    … 入金期日の日（期日が12時より前なら前日）
// 期限・期日の値をキーに含めるので、主催者が日時を変えたら新しい日時でまた1回。
//
// 対象：開催前の募集（open／締切 closed）。中止（heldCancelledAt）・完了・行ける日の部屋・日付未定は除く。

function authorizeCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('vercel-cron')) return true;
  const url = new URL(req.url);
  if (expected && url.searchParams.get('secret') === expected) return true;
  return false;
}

const DAY = 24 * 60 * 60 * 1000;
const JST = 9 * 60 * 60 * 1000;
const SEND_HOUR = 12;
const MAX_PER_TICK = 60;
// 🙏 は実行時に作る。文字列を定数のまま並べると、ビルド（SWC）がテンプレート文字列にまとめる際に
// 絵文字を「\uD83D\uDE4F」と二重にエスケープし、チャットにそのまま文字で出た（2026-10-12）
const PRAY = String.fromCodePoint(0x1F64F);

const dayNo = (ms: number) => Math.floor((ms + JST) / DAY);   // JST の通し日数
function targetMs(date: string, startTime?: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!dm) return null;
  let h = 0, mi = 0;
  const tm = startTime ? /^(\d{1,2}):(\d{2})/.exec(startTime) : null;
  if (tm) { h = +tm[1]; mi = +tm[2]; }
  const utcMs = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], h - 9, mi);
  return Number.isFinite(utcMs) ? utcMs : null;
}
function fmt(ms: number): string {
  const d = new Date(ms + JST);
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${w}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function hm(ms: number): string {
  const d = new Date(ms + JST);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
/** 期限の「お知らせする日」：期限の日。期限が12時より前なら前日（12時に書くと過ぎてしまうため） */
function noticeDayOf(deadline: number): number {
  const d = new Date(deadline + JST);
  return d.getUTCHours() < SEND_HOUR ? dayNo(deadline) - 1 : dayNo(deadline);
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const now = Date.now();
  const jstHour = new Date(now + JST).getUTCHours();
  if (jstHour < SEND_HOUR) return NextResponse.json({ ok: true, skipped: 'before_noon' }, { headers: noStore });
  const today = dayNo(now);
  const daysBefore = await getReminderDaysBefore();
  const allRounds = await db.listRounds();

  type Job = { round: any; key: string; text: string };
  const jobs: Job[] = [];
  for (const r of allRounds as any[]) {
    if (jobs.length >= MAX_PER_TICK) break;
    if (r.status !== 'open' && r.status !== 'closed') continue;
    if (r.heldCancelledAt || r.availDate || !r.date) continue;
    const target = targetMs(r.date, r.startTime);
    if (target === null || target < now) continue;
    const sent = r.upcomingRemindersSent || {};
    const title = r.title || r.courseName || 'ラウンド';
    const when = `${fmt(target).replace(/ 00:00$/, '')}`;
    const pi = r.paymentEnabled ? (r.paymentInfo || {}) : {};
    const payDl = Number(pi.deadline) || 0;
    const cancelDl = Number(r.cancelPolicy?.deadline) || 0;

    // 開催の N 日前
    const daysUntil = dayNo(target) - today;
    if (daysBefore.includes(daysUntil) && !sent[`d${daysUntil}`]) {
      const head = daysUntil === 0 ? '本日はいよいよラウンドです！' : daysUntil === 1 ? '明日はいよいよラウンドです！'
        : daysUntil === 7 ? 'ラウンドの1週間前になりました！' : daysUntil >= 28 && daysUntil <= 31 ? 'ラウンドの1か月前になりました！' : `ラウンドの${daysUntil}日前になりました！`;
      const lines = [`@全員`, `⛳ ${head}`, `「${title}」${when}`, ''];
      lines.push(daysUntil <= 1 ? '集合場所・時間とピックアップ（送迎）の最終確認をお願いします' + PRAY : 'ピックアップ（送迎）や入金などの確認をお願いします' + PRAY);
      if (payDl && payDl > now) lines.push(`💴 入金期日：${fmt(payDl)}`);
      if (cancelDl && cancelDl > now) lines.push(`⏰ キャンセル期限：${fmt(cancelDl)}`);
      jobs.push({ round: r, key: `d${daysUntil}`, text: lines.join('\n') });
      continue;   // 1回の見回りで同じ募集に書くのは1件まで（次の見回りで残りを書く）
    }
    // キャンセル期限
    if (cancelDl && cancelDl > now - DAY && noticeDayOf(cancelDl) === today && !sent[`cancel_${cancelDl}`]) {
      const isToday = dayNo(cancelDl) === today;
      jobs.push({ round: r, key: `cancel_${cancelDl}`, text: [
        `@全員`, `⏰ ${isToday ? '本日' : '明日'} ${hm(cancelDl)} がキャンセル期限です（「${title}」）`,
        '', '期限を過ぎると、アプリからは参加を取りやめられなくなります。行けなくなりそうな方は、それまでにお知らせください' + PRAY,
      ].join('\n') });
      continue;
    }
    // 入金期日の3日前
    if (payDl && payDl > now && dayNo(payDl) - 3 === today && !sent[`pay3_${payDl}`]) {
      jobs.push({ round: r, key: `pay3_${payDl}`, text: [
        `@全員`, `💴 入金期日まであと3日です（${fmt(payDl)}）`,
        pi.amount ? `「${title}」の参加費 ${Number(pi.amount).toLocaleString('ja-JP')}円` : `「${title}」の参加費`,
        '', 'まだの方は「💰 入金」タブの振込先へお願いします。入金済みの方は、このメッセージは気にしないでください' + PRAY,
      ].join('\n') });
      continue;
    }
    // 入金期日の当日
    if (payDl && payDl > now && noticeDayOf(payDl) === today && !sent[`pay0_${payDl}`]) {
      const isToday = dayNo(payDl) === today;
      jobs.push({ round: r, key: `pay0_${payDl}`, text: [
        `@全員`, `💴 ${isToday ? '本日' : '明日'} ${hm(payDl)} が入金期日です（「${title}」）`,
        pi.amount ? `参加費 ${Number(pi.amount).toLocaleString('ja-JP')}円` : '',
        '', 'まだの方は「💰 入金」タブの振込先へお願いします。入金済みの方は、このメッセージは気にしないでください' + PRAY,
      ].filter((x, i) => x !== '' || i > 2).join('\n') });
      continue;
    }
  }

  const { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } = await import('@/lib/adminManagerId');
  const { ensureAdminManager } = await import('@/lib/adminManager');
  const { notifyRoundChat } = await import('@/lib/roundChatNotify');
  if (jobs.length) await ensureAdminManager();
  const results: any[] = [];
  for (const { round, key, text } of jobs) {
    // 先に印を付ける（見回りが重なっても二重に書かない）
    const stamp = { ...(round.upcomingRemindersSent || {}), [key]: now };
    await db.updateRound(round.id, { upcomingRemindersSent: stamp } as any);
    try {
      await db.addRoundMessage(round.id, ADMIN_MANAGER_ID, text);
      await notifyRoundChat(round, ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME, text);
      results.push({ roundId: round.id, key });
    } catch (e) {
      console.warn('[upcoming-reminders] post failed', { roundId: round.id, key, err: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, posted: results.length, results }, { headers: noStore });
}
