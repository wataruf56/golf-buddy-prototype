import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { createSwing } from '@/lib/swingFirestore';
import { isSwingAllowed } from '@/lib/swingAccess';
import type { SwingDoc, SwingMode } from '@/types/swing';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const VALID_MODES: SwingMode[] = ['self', 'compare', 'past', 'question'];

// POST /api/swing/submit
// Body: { swingId, mode, videoGcsPath, proGcsPath?, prevGcsPath?, userMessage? }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await isSwingAllowed(meId))) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }

  const swingId = String(body?.swingId || '').trim();
  const mode = body?.mode as SwingMode;
  const videoGcsPath = String(body?.videoGcsPath || '').trim();
  const proGcsPath = body?.proGcsPath ? String(body.proGcsPath).trim() : undefined;
  const prevGcsPath = body?.prevGcsPath ? String(body.prevGcsPath).trim() : undefined;
  const userMessage = body?.userMessage ? String(body.userMessage).trim() : undefined;

  if (!swingId) return NextResponse.json({ error: 'swingId required' }, { status: 400, headers: noStore });
  if (!VALID_MODES.includes(mode)) return NextResponse.json({ error: 'invalid mode' }, { status: 400, headers: noStore });
  if (!videoGcsPath) return NextResponse.json({ error: 'videoGcsPath required' }, { status: 400, headers: noStore });
  if (mode === 'compare' && !proGcsPath) return NextResponse.json({ error: 'proGcsPath required for compare mode' }, { status: 400, headers: noStore });
  if (mode === 'past' && !prevGcsPath) return NextResponse.json({ error: 'prevGcsPath required for past mode' }, { status: 400, headers: noStore });
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
    userMessage,
    billingPlanSnapshot: 'free',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await createSwing(doc);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }

  // Fire-and-forget: kick the worker immediately so users don't wait for the next Cron tick.
  // We don't await — the response returns now and the worker keeps running on its own.
  const cron = process.env.CRON_SECRET || '';
  if (cron) {
    const origin = new URL(req.url).origin;
    fetch(`${origin}/api/swing/process?secret=${encodeURIComponent(cron)}`, {
      method: 'GET',
      // @ts-ignore — Next.js fetch supports `cache` and timeout via AbortController
      cache: 'no-store',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, swingId }, { headers: noStore });
}
