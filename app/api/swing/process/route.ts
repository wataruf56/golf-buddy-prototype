import { NextRequest, NextResponse } from 'next/server';
import { listQueuedSwings, updateSwing, getSwing } from '@/lib/swingFirestore';
import { analyzeSwing, AnalyzerError } from '@/lib/swingAnalyzer';
import { buildPromptForMode } from '@/lib/swingPrompts';
import { splitReviewByDivider } from '@/lib/swingSplitter';
import type { SwingDoc } from '@/types/swing';

// Increase timeout for Vercel — we may run analyzeSwing inline (60〜120s).
export const maxDuration = 300;

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/process
// Trigger: Vercel Cron (* * * * *) or manual ?token=CRON_SECRET
function authorizeCron(req: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when configured.
  const auth = req.headers.get('authorization') || '';
  const expected = process.env.CRON_SECRET || '';
  if (expected && auth === `Bearer ${expected}`) return true;
  // Vercel-internal cron user-agent
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('vercel-cron')) return true;
  // Internal fire-and-forget kick from /api/swing/submit
  const url = new URL(req.url);
  if (expected && url.searchParams.get('secret') === expected) return true;
  return false;
}

const MAX_PER_TICK = 3;
const MAX_RETRY = 2;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const queued = await listQueuedSwings(MAX_PER_TICK);
  if (!queued.length) return NextResponse.json({ ok: true, processed: 0 }, { headers: noStore });

  const results: any[] = [];
  for (const swing of queued) {
    try {
      const r = await processOne(swing);
      results.push({ swingId: swing.swingId, ok: true, ...r });
    } catch (e) {
      results.push({ swingId: swing.swingId, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results }, { headers: noStore });
}

async function processOne(swing: SwingDoc): Promise<{ status: string }> {
  const { userId, swingId, mode } = swing;

  // Idempotency: if analysisRunId already set without reviewText, treat as failed (manual recovery).
  // But normally we only see status='queued' here so this is defensive.
  const fresh = await getSwing(userId, swingId);
  if (!fresh) return { status: 'gone' };
  if (fresh.status !== 'queued') return { status: `already_${fresh.status}` };

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await updateSwing(userId, swingId, {
    status: 'analyzing',
    analysisRunId: runId,
    startedAnalyzingAt: Date.now(),
    errorMessage: '',
  });

  // Build prompt
  const prompt = buildPromptForMode({ mode, userMessage: fresh.userMessage });

  // Decide analyzer args per mode (matches gas/60_worker.js dispatch)
  let gcsUri = '';
  let gcsUri2: string | undefined;
  if (mode === 'compare') {
    if (!fresh.proGcsPath) throw new Error('compare: proGcsPath missing');
    if (!fresh.videoGcsPath) throw new Error('compare: videoGcsPath missing');
    gcsUri = fresh.proGcsPath;       // 1本目=プロ
    gcsUri2 = fresh.videoGcsPath;    // 2本目=自分
  } else if (mode === 'past') {
    if (!fresh.prevGcsPath) throw new Error('past: prevGcsPath missing');
    if (!fresh.videoGcsPath) throw new Error('past: videoGcsPath missing');
    gcsUri = fresh.prevGcsPath;      // 1本目=過去
    gcsUri2 = fresh.videoGcsPath;    // 2本目=今回
  } else {
    if (!fresh.videoGcsPath) throw new Error(`${mode}: videoGcsPath missing`);
    gcsUri = fresh.videoGcsPath;
  }

  let reviewText = '';
  try {
    reviewText = await analyzeSwing({ gcsUri, gcsUri2, prompt });
  } catch (e) {
    const err = e as AnalyzerError;
    const retryCount = (fresh.retryCount || 0) + 1;
    const canRetry = err.retryable && retryCount <= MAX_RETRY;
    await updateSwing(userId, swingId, {
      status: canRetry ? 'queued' : 'failed',
      analysisRunId: '', // allow re-run
      retryCount,
      errorMessage: err.message.slice(0, 500),
    });
    return { status: canRetry ? 'requeued' : 'failed' };
  }

  const chunks = splitReviewByDivider(reviewText);
  await updateSwing(userId, swingId, {
    status: 'done',
    reviewText,
    reviewTextChunks: chunks,
    completedAt: Date.now(),
    errorMessage: '',
  });

  // Keep videos in GCS so the result page can play them back.
  return { status: 'done' };
}
