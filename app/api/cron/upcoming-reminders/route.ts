import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { getReminderDaysBefore } from '@/lib/roundReminderConfig';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// 開催「前」リマインド: 参加ラウンドの 1ヶ月前 / 1週間前 / 前日 に、参加者へ
// LINE＋アプリ内通知でお知らせする。housekeeping cron から呼ばれる。
//
// 冪等性: round.upcomingRemindersSent[key] にバンドごとの送信時刻を記録し、
// 同じバンドは二度送らない。後から作られたラウンドは、今いるバンドだけ送る
// （例: 3日前に作成 → d7バンドのみ→ のちに d1）。
//
// バンド（JSTのカレンダー日数 daysUntil で判定）:
//   d30: 8〜31日後   d7: 2〜7日後   d1: 0〜1日後

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
const MAX_PER_TICK = 80;

function targetMs(date: string, startTime?: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!dm) return null;
  const [, y, mo, d] = dm;
  let h = 0, mi = 0;
  const tm = startTime ? /^(\d{1,2}):(\d{2})/.exec(startTime) : null;
  if (tm) { h = +tm[1]; mi = +tm[2]; }
  const utcMs = Date.UTC(+y, +mo - 1, +d, h - 9, mi); // JSTローカルとして解釈
  return Number.isFinite(utcMs) ? utcMs : null;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const now = Date.now();
  const dnow = Math.floor((now + JST) / DAY); // JSTでの「今日」の通し日数
  // 管理画面で設定した「開催の何日前に送るか」（例: [30,7,1]）。
  const daysBefore = await getReminderDaysBefore();
  const allRounds = await db.listRounds();

  type Job = { round: any; key: string; daysUntil: number };
  const jobs: Job[] = [];
  if (daysBefore.length) {
    for (const r of allRounds) {
      if (r.status !== 'open') continue;        // 募集中のみ（締切/完了は対象外）
      if (!r.date) continue;                     // 日程未確定（範囲のみ）は対象外
      const target = targetMs(r.date, r.startTime);
      if (target === null) continue;
      const dtar = Math.floor((target + JST) / DAY);
      const daysUntil = dtar - dnow;             // JSTカレンダー日数
      if (daysUntil < 0) continue;               // 過去は対象外
      if (!daysBefore.includes(daysUntil)) continue; // 設定された「◯日前」に一致した日だけ送る
      const key = `d${daysUntil}`;
      if (r.upcomingRemindersSent && r.upcomingRemindersSent[key]) continue; // 送信済み
      jobs.push({ round: r, key, daysUntil });
      if (jobs.length >= MAX_PER_TICK) break;
    }
  }

  let sent = 0, skipped = 0;
  const results: any[] = [];
  for (const { round, key, daysUntil } of jobs) {
    const participants = Array.from(new Set([round.hostId, ...(round.applicantIds || [])])).filter(Boolean);
    const stamp = { ...(round.upcomingRemindersSent || {}), [key]: now };

    if (!participants.length) {
      await db.updateRound(round.id, { upcomingRemindersSent: stamp } as any);
      skipped++;
      continue;
    }

    const roundName = round.title || round.courseName || 'ラウンド';
    const whenLabel = daysUntil <= 0 ? '本日' : daysUntil === 1 ? '明日' : `あと${daysUntil}日`;
    const dateLine = round.date ? `${round.date}${round.startTime ? ' ' + round.startTime : ''}` : '';

    // アプリ内のお知らせ（LINE設定に関わらず必ず記録）。
    {
      const { addNotificationMany } = await import('@/lib/notifications');
      addNotificationMany(
        participants,
        'roundUpcoming',
        `📅 「${roundName}」は${whenLabel}開催です${dateLine ? `（${dateLine}）` : ''}`,
        `/round/${round.id}`,
      ).catch(() => {});
    }

    const users = await db.listUsers(participants);
    const targetIds = users.filter((u) => isNotifyEnabled(u as any, 'roundUpcoming')).map((u) => u.id);
    if (targetIds.length) {
      try {
        await pushToMany(
          targetIds,
          `⛳ ラウンドのお知らせ\n「${roundName}」は${whenLabel}開催です。\n${dateLine}\n持ち物・集合場所の確認をお願いします。`,
          liffUrl(`/round/${round.id}`),
        );
        const { webPushToMany } = await import('@/lib/webPush');
        await webPushToMany(targetIds, `⛳ ${roundName} は${whenLabel}`, dateLine || 'タップで詳細', `/round/${round.id}`, `upcoming-${round.id}-${key}`).catch(() => {});
        sent++;
      } catch (e) {
        console.warn('[upcoming-reminders] push failed', { roundId: round.id, err: (e as Error).message });
      }
    } else {
      skipped++;
    }

    await db.updateRound(round.id, { upcomingRemindersSent: stamp } as any);
    results.push({ roundId: round.id, band: key, daysUntil, recipients: targetIds.length });
  }

  return NextResponse.json({ ok: true, scanned: jobs.length, sent, skipped, results }, { headers: noStore });
}
