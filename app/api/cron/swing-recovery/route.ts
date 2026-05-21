import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { pushToMany, liffUrl } from '@/lib/linePush';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// Vercel Cron: */5 * * * *. Two jobs in one tick:
//   1. Auto-requeue any swing stuck in 'analyzing' for >5 min. The cause is
//      usually a Vercel function timeout / Cloud Run timeout, not a real
//      analysis failure, so kicking it back to 'queued' lets the worker
//      retry without user action.
//   2. Notify admin (ADMIN_NOTIFY_USER_IDS via LINE) if anything was stuck
//      OR if any swing has been sitting in 'failed' for the last hour. The
//      message is sent to admins only — never to end users — and only once
//      per swing id (recorded as adminAlertedAt on the doc) so we don't
//      spam the admin's LINE every 5 minutes.

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

const STUCK_MS = 5 * 60 * 1000;
const FAILED_LOOKBACK_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ ok: false, error: 'no_db' }, { headers: noStore });

  const now = Date.now();

  // 1. Pull recent in-flight docs (analyzing + failed in last hour). Keep
  //    the query bounded so this stays cheap even at scale.
  const [analyzingSnap, failedSnap] = await Promise.all([
    db.collection('swings').where('status', '==', 'analyzing').limit(50).get(),
    db.collection('swings')
      .where('status', '==', 'failed')
      .where('updatedAt', '>=', now - FAILED_LOOKBACK_MS)
      .limit(50)
      .get()
      .catch(() => ({ docs: [] as any[] })),
  ]);

  // 2. Identify stuck analyzing docs and requeue them.
  const stuck: any[] = [];
  for (const d of analyzingSnap.docs) {
    const data = d.data();
    const startedAt = data.startedAnalyzingAt || data.updatedAt || 0;
    if (startedAt && now - startedAt > STUCK_MS) {
      stuck.push({ ref: d.ref, data });
    }
  }

  let requeuedCount = 0;
  for (const s of stuck) {
    await s.ref.set({
      status: 'queued',
      analysisRunId: '',
      errorMessage: 'auto_requeued_after_stuck',
      updatedAt: now,
    }, { merge: true });
    requeuedCount++;
  }

  // 3. Collect docs that warrant an admin alert: just-requeued stuck docs
  //    AND recently-failed docs we haven't alerted on yet (adminAlertedAt
  //    unset). The de-dup field is what stops us from spamming every 5 min.
  const alertTargets: any[] = [];
  for (const s of stuck) {
    if (!s.data.adminAlertedAt) alertTargets.push({ ref: s.ref, data: s.data, kind: 'stuck' as const });
  }
  for (const d of failedSnap.docs) {
    const data = d.data();
    if (!data.adminAlertedAt) alertTargets.push({ ref: d.ref, data, kind: 'failed' as const });
  }

  // 4. Notify admins. Send one consolidated push per tick (not one per swing)
  //    so a backlog doesn't flood LINE.
  let notified = false;
  const adminIdsRaw = (process.env.ADMIN_NOTIFY_USER_IDS || '').trim();
  if (alertTargets.length && adminIdsRaw) {
    const adminIds = adminIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (adminIds.length) {
      const stuckN = alertTargets.filter((a) => a.kind === 'stuck').length;
      const failedN = alertTargets.filter((a) => a.kind === 'failed').length;
      const lines: string[] = [];
      lines.push('🚨 スイング解析アラート');
      if (stuckN) lines.push(`・5分以上 stuck → 再キュー済み: ${stuckN}件`);
      if (failedN) lines.push(`・失敗(直近1時間): ${failedN}件`);
      // Sample one error message for context.
      const sample = alertTargets.find((a) => a.data.errorMessage);
      if (sample) {
        lines.push('');
        lines.push(`例: ${String(sample.data.errorMessage).slice(0, 160)}`);
      }
      lines.push('');
      lines.push('管理画面で詳細確認:');
      try {
        await pushToMany(adminIds, lines.join('\n'), liffUrl('/admin/swing'));
        notified = true;
        // Mark all targets so we don't re-alert next tick.
        await Promise.all(alertTargets.map((t) =>
          t.ref.set({ adminAlertedAt: now }, { merge: true }),
        ));
      } catch (e) {
        console.warn('[swing-recovery] admin push failed', (e as Error).message);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    now,
    stuckFound: stuck.length,
    requeued: requeuedCount,
    failedRecent: failedSnap.docs.length,
    alertTargets: alertTargets.length,
    notified,
  }, { headers: noStore });
}
