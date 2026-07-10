import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany, liffUrl } from '@/lib/linePush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// For each OPEN round whose play date is ~3 days out (and not yet reminded),
// push a "締切間近" LINE message to everyone who tapped ♡「気になる」on it —
// nudging them to apply before it fills up. Idempotent via
// round.interestDeadlineSentAt. Date-less (flexible) rounds are skipped.
//
// Auth: same pattern as the other crons — Bearer CRON_SECRET, vercel-cron UA,
// or ?secret=. Invoked from /api/cron/housekeeping each tick.

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

// Send when the round starts within this window (3 days), but hasn't started.
const LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_PER_TICK = 50;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const allRounds = await db.listRounds();
  const now = Date.now();
  const candidates = allRounds.filter((r) => {
    if (r.interestDeadlineSentAt) return false;          // already sent
    if (r.status !== 'open') return false;               // only live recruiting
    if (!(r.interestedIds || []).length) return false;   // no one to notify
    if (!r.date || !r.startTime) return false;           // need a fixed date
    const target = scheduledMs(r.date, r.startTime);
    if (target === null) return false;
    // Within the 3-day window and not yet started.
    return target > now && target - now <= LEAD_MS;
  }).slice(0, MAX_PER_TICK);

  let sent = 0;
  let skipped = 0;
  const results: any[] = [];
  for (const round of candidates) {
    const interested = Array.from(new Set(round.interestedIds || [])).filter(Boolean);
    // Don't ping people who are already approved participants.
    const approved = new Set([round.hostId, ...(round.applicantIds || [])]);
    const targets = interested.filter((id) => !approved.has(id));

    if (targets.length) {
      const users = await db.listUsers(targets);
      const name = round.title || round.courseName || 'ラウンド';
      const link = `/round/${round.id}`;
      const { renderNotif } = await import('@/lib/notificationTemplateStore');
      const n = await renderNotif('interestDeadline', { '募集タイトル': name, '開催日': round.date || '', '開始時刻': round.startTime || '' });
      // Always record in every target's in-app inbox (home screen), even if
      // LINE is off.
      {
        const { addNotificationMany } = await import('@/lib/notifications');
        if (n.inApp) addNotificationMany(targets, 'interestDeadline', n.inApp, link).catch(() => {});
      }
      const targetIds = users
        .filter((u) => isNotifyEnabled(u as any, 'interestDeadline'))
        .map((u) => u.id);
      if (targetIds.length) {
        try {
          await pushToMany(targetIds, n.line, liffUrl(link));
          const { webPushToMany } = await import('@/lib/webPush');
          await webPushToMany(targetIds, n.webTitle, n.webBody, link, `interest-deadline-${round.id}`).catch(() => {});
          sent++;
        } catch (e) {
          console.warn('[interest-reminders] push failed', { roundId: round.id, err: (e as Error).message });
        }
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }

    // Always stamp so we don't re-evaluate this round forever.
    await db.updateRound(round.id, { interestDeadlineSentAt: now } as any);
    results.push({ roundId: round.id, recipients: targets.length });
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, skipped, results }, { headers: noStore });
}

function scheduledMs(date: string, startTime: string): number | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const [, h, mi] = tm;
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 9, +mi); // treat stored fields as JST
  return Number.isFinite(utcMs) ? utcMs : null;
}
