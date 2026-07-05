import { NextRequest, NextResponse } from 'next/server';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// Combined housekeeping cron — runs swing-recovery AND round-reminders in a
// single tick. We merged the two into one endpoint because the Vercel Hobby
// plan caps the project at 2 cron jobs total (the other being
// /api/swing/process). Each piece still has its own route file for manual
// invocation / testing; here we just call their GET handlers in-process.

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

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const results: Record<string, any> = {};

  // Run both jobs. Import the handlers and invoke with the same request so
  // their internal auth check passes (it sees the vercel-cron UA / secret).
  try {
    const { GET: recovery } = await import('../swing-recovery/route');
    const res = await recovery(req);
    results.swingRecovery = await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    results.swingRecovery = { error: (e as Error).message };
  }

  try {
    const { GET: reminders } = await import('../round-reminders/route');
    const res = await reminders(req);
    results.roundReminders = await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    results.roundReminders = { error: (e as Error).message };
  }

  try {
    const { GET: interestReminders } = await import('../interest-reminders/route');
    const res = await interestReminders(req);
    results.interestReminders = await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    results.interestReminders = { error: (e as Error).message };
  }

  try {
    const { GET: upcomingReminders } = await import('../upcoming-reminders/route');
    const res = await upcomingReminders(req);
    results.upcomingReminders = await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    results.upcomingReminders = { error: (e as Error).message };
  }

  try {
    const { GET: rematchNotifier } = await import('../rematch-notifier/route');
    const res = await rematchNotifier(req);
    results.rematchNotifier = await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    results.rematchNotifier = { error: (e as Error).message };
  }

  return NextResponse.json({ ok: true, ...results }, { headers: noStore });
}
