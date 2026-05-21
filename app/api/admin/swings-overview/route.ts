import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/admin/swings-overview?token=XXX
// Cross-user dashboard for /admin/swing — counts by status, plus the most
// recent N of each status so the admin can see stuck ones at a glance and
// requeue them with a single click. Replaces the old "input a userId first"
// flow which made the page look broken when admin opened it.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const requeue = url.searchParams.get('requeue') === '1';
  const stuckMinutes = parseInt(url.searchParams.get('stuck') || '5', 10) || 5;
  const stuckMs = stuckMinutes * 60 * 1000;
  const now = Date.now();

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });

  // Pull recent docs (last 200) so we cover the active window. Status counts
  // are over the same window — good enough for an at-a-glance dashboard.
  const snap = await db
    .collection('swings')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const docs = snap.docs.map((d: any) => ({ ref: d.ref, data: d.data() }));

  const counts: Record<string, number> = { queued: 0, analyzing: 0, done: 0, failed: 0, other: 0 };
  for (const d of docs) {
    const s = String(d.data.status || 'other');
    if (s in counts) counts[s]++; else counts.other++;
  }

  // Identify stuck items: analyzing for > stuckMinutes, OR failed in last hour.
  const stuck = docs
    .filter((d) => {
      const data = d.data;
      if (data.status === 'analyzing') {
        const startedAt = data.startedAnalyzingAt || data.updatedAt || 0;
        return startedAt && (now - startedAt) > stuckMs;
      }
      if (data.status === 'failed') {
        return (now - (data.updatedAt || 0)) < 60 * 60 * 1000;
      }
      return false;
    });

  let requeuedCount = 0;
  if (requeue) {
    for (const s of stuck) {
      await s.ref.set({
        status: 'queued',
        analysisRunId: '',
        errorMessage: '',
        updatedAt: now,
      }, { merge: true });
      requeuedCount++;
    }
  }

  // Pull the most recent of each status for the UI list. Keep payload small —
  // we only need enough to identify the swing + understand the failure.
  const summarise = (d: any) => ({
    swingId: d.data.swingId,
    userId: d.data.userId,
    mode: d.data.mode,
    status: d.data.status,
    createdAt: d.data.createdAt,
    startedAnalyzingAt: d.data.startedAnalyzingAt,
    updatedAt: d.data.updatedAt,
    completedAt: d.data.completedAt,
    errorMessage: (d.data.errorMessage || '').slice(0, 280),
    hasReview: !!d.data.reviewText,
  });

  const byStatus = (status: string) =>
    docs.filter((d) => d.data.status === status).slice(0, 10).map(summarise);

  return NextResponse.json({
    now,
    counts,
    stuckCount: stuck.length,
    requeuedCount,
    recent: {
      analyzing: byStatus('analyzing'),
      failed: byStatus('failed'),
      queued: byStatus('queued'),
      done: byStatus('done').slice(0, 5),
    },
    stuckSwings: stuck.map((s) => summarise(s)),
  }, { headers: noStore });
}
