import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany, liffUrl } from '@/lib/linePush';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// Vercel Cron: fires every 30 minutes. For each round whose scheduled start
// time + 6 hours has passed and we haven't sent the reminder yet, push
// "レビューしてください" via LINE to every participant. A typical 18-hole
// round runs ~4.5 hours, so +6h lands ~1.5h after most rounds wrap — late
// enough that everyone's home and home, early enough that the day's still
// fresh in their head.
//
// Idempotent: we stamp round.reviewReminderSentAt on first send, so even if
// this cron fires more often we won't double-notify.
//
// Auth: same pattern as /api/swing/process — Vercel Cron sends Bearer
// CRON_SECRET, manual hits accept ?secret=. Anything else gets 403.

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

const REMINDER_DELAY_MS = 6 * 60 * 60 * 1000;
const MAX_PER_TICK = 50;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  // Pull every round whose date is today-or-earlier and that's eligible to
  // have rounds scheduled in it. We intentionally include 'open' and
  // 'completed'; 'closed' means the host explicitly killed the round before
  // it happened, so no reviews are owed.
  const allRounds = await db.listRounds();
  const now = Date.now();
  const candidates = allRounds.filter((r) => {
    if (r.reviewReminderSentAt) return false;            // already sent
    if (r.status !== 'open' && r.status !== 'completed') return false;
    if (!r.date) return false;                            // flexible w/o locked date
    if (!r.startTime) return false;                       // no time → can't compute target
    const target = scheduledMs(r.date, r.startTime);
    if (target === null) return false;
    return now >= target + REMINDER_DELAY_MS;
  }).slice(0, MAX_PER_TICK);

  let sent = 0;
  let skipped = 0;
  const results: any[] = [];
  for (const round of candidates) {
    const participants = Array.from(new Set([round.hostId, ...(round.applicantIds || [])])).filter(Boolean);
    if (!participants.length) {
      // No-one to notify — still mark sent so we don't keep re-scanning.
      await db.updateRound(round.id, { reviewReminderSentAt: now } as any);
      skipped++;
      continue;
    }

    // Filter out users who turned off notifications.
    const users = await db.listUsers(participants);
    const targetIds = users
      .filter((u) => u && !(u as any).notifyOff)
      .map((u) => u.id);

    if (targetIds.length) {
      try {
        await pushToMany(
          targetIds,
          `⛳ お疲れさまでした！\n「${round.title || round.courseName || 'ラウンド'}」のレビューをお願いします。\nスコアの入力もこちらから。`,
          liffUrl(`/round/${round.id}`),
        );
        sent++;
      } catch (e) {
        console.warn('[round-reminders] push failed', { roundId: round.id, err: (e as Error).message });
      }
    } else {
      skipped++;
    }

    // Always stamp so we don't re-evaluate this round forever, even if push
    // failed (we don't want to spam on every cron tick if LINE is down).
    await db.updateRound(round.id, { reviewReminderSentAt: now } as any);
    results.push({ roundId: round.id, recipients: targetIds.length });
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, skipped, results }, { headers: noStore });
}

/**
 * Combine a "YYYY-MM-DD" + "HH:mm" pair into a JST ms timestamp.
 * Returns null if either field is malformed.
 */
function scheduledMs(date: string, startTime: string): number | null {
  // date: "2026-05-16", startTime: "13:30" or "13:00:00"
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const [, h, mi] = tm;
  // Treat the stored fields as JST local. Convert to UTC by subtracting 9h.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h - 9, +mi);
  return Number.isFinite(utcMs) ? utcMs : null;
}
