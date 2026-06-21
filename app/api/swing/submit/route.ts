import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { createSwing } from '@/lib/swingFirestore';
import { getSwingQuota, incrementSwingUsage } from '@/lib/swingQuota';
import type { SwingDoc, SwingMode } from '@/types/swing';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const VALID_MODES: SwingMode[] = ['self', 'compare', 'past', 'range_vs_round', 'question'];

// POST /api/swing/submit
// Body: { swingId, mode, videoGcsPath, proGcsPath?, prevGcsPath?, rangeGcsPath?, userMessage? }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  // Quota gate. Whitelisted users (admin-approved) bypass the counter and
  // get unlimited runs; everyone else is capped at SWING_FREE_LIMIT/month
  // (default 1). 402 = "payment required" so the client can distinguish a
  // quota refusal from auth/validation failures.
  const quota = await getSwingQuota(meId);
  if (!quota.allowed) {
    return NextResponse.json({
      error: 'quota_exceeded',
      used: quota.used,
      limit: quota.limit,
      month: quota.month,
      message: `今月の無料解析枠 ${quota.limit} 回を使い切りました (${quota.month})`,
    }, { status: 402, headers: noStore });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }

  const swingId = String(body?.swingId || '').trim();
  const mode = body?.mode as SwingMode;
  const videoGcsPath = String(body?.videoGcsPath || '').trim();
  const proGcsPath = body?.proGcsPath ? String(body.proGcsPath).trim() : undefined;
  const prevGcsPath = body?.prevGcsPath ? String(body.prevGcsPath).trim() : undefined;
  const rangeGcsPath = body?.rangeGcsPath ? String(body.rangeGcsPath).trim() : undefined;
  const userMessage = body?.userMessage ? String(body.userMessage).trim() : undefined;
  const club = body?.club ? String(body.club).slice(0, 40).trim() : undefined;

  if (!swingId) return NextResponse.json({ error: 'swingId required' }, { status: 400, headers: noStore });
  if (!VALID_MODES.includes(mode)) return NextResponse.json({ error: 'invalid mode' }, { status: 400, headers: noStore });
  if (!videoGcsPath) return NextResponse.json({ error: 'videoGcsPath required' }, { status: 400, headers: noStore });
  if (mode === 'compare' && !proGcsPath) return NextResponse.json({ error: 'proGcsPath required for compare mode' }, { status: 400, headers: noStore });
  if (mode === 'past' && !prevGcsPath) return NextResponse.json({ error: 'prevGcsPath required for past mode' }, { status: 400, headers: noStore });
  if (mode === 'range_vs_round' && !rangeGcsPath) return NextResponse.json({ error: 'rangeGcsPath required for range_vs_round mode' }, { status: 400, headers: noStore });
  if (mode === 'question' && !userMessage) return NextResponse.json({ error: 'userMessage required for question mode' }, { status: 400, headers: noStore });

  const now = Date.now();
  const doc: SwingDoc = {
    swingId,
    userId: meId,
    status: 'queued',
    mode,
    videoGcsPath,
    proGcsPath,
    prevGcsPath,
    rangeGcsPath,
    userMessage,
    club,
    billingPlanSnapshot: 'free',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await createSwing(doc);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }

  // Counted at submit time, not at analysis success — otherwise users could
  // re-roll free runs by force-quitting after upload. No-op for whitelist.
  try { await incrementSwingUsage(meId); } catch (e) { console.warn('[swing/submit] usage bump failed', e); }

  // Fire-and-forget: kick the worker immediately so users don't wait for the
  // next Cron tick. Vercel kills dangling promises after the response, so we
  // wrap the fetch in `waitUntil` to guarantee the runtime keeps the kick
  // alive until it actually fires (otherwise the user waits 0〜60s for the
  // next cron tick before processing even starts).
  const cron = process.env.CRON_SECRET || '';
  if (cron) {
    const origin = new URL(req.url).origin;
    const kickUrl = `${origin}/api/swing/process?secret=${encodeURIComponent(cron)}`;
    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(fetch(kickUrl, { method: 'GET', cache: 'no-store' }).catch(() => {}));
    } catch {
      // Local dev / non-Vercel runtime: fall back to bare fetch.
      fetch(kickUrl, { method: 'GET', cache: 'no-store' }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, swingId }, { headers: noStore });
}
