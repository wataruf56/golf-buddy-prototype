import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSwing, updateSwing } from '@/lib/swingFirestore';
import { isSwingAllowed } from '@/lib/swingAccess';
import { deleteByGcsUri } from '@/lib/swingGcs';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/[id] — used for polling on the result page.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await isSwingAllowed(meId))) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });
  const swing = await getSwing(meId, params.id);
  if (!swing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  return NextResponse.json({ swing }, { headers: noStore });
}

// PATCH /api/swing/[id] body: { action: 'retry' }
// Currently supports re-queuing a failed analysis (no need to re-upload video).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await isSwingAllowed(meId))) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });
  const swing = await getSwing(meId, params.id);
  if (!swing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const action = String(body?.action || '');

  if (action === 'retry') {
    if (swing.status === 'analyzing') return NextResponse.json({ error: 'already_running' }, { status: 409, headers: noStore });
    if (!swing.videoGcsPath) return NextResponse.json({ error: 'video_already_deleted' }, { status: 400, headers: noStore });
    await updateSwing(meId, params.id, {
      status: 'queued',
      analysisRunId: '',
      errorMessage: '',
      retryCount: 0,
    });
    // Fire-and-forget worker kick
    const cron = process.env.CRON_SECRET || '';
    if (cron) {
      const origin = new URL(req.url).origin;
      fetch(`${origin}/api/swing/process?secret=${encodeURIComponent(cron)}`, { method: 'GET', cache: 'no-store' }).catch(() => {});
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400, headers: noStore });
}

// DELETE /api/swing/[id] — remove the swing doc + delete videos from GCS.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  if (!(await isSwingAllowed(meId))) return NextResponse.json({ error: 'beta_only' }, { status: 403, headers: noStore });
  const swing = await getSwing(meId, params.id);
  if (!swing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  // Delete videos from GCS first (best-effort).
  const targets = [swing.videoGcsPath, swing.proGcsPath, swing.prevGcsPath].filter(Boolean) as string[];
  await Promise.all(targets.map((u) => deleteByGcsUri(u).catch(() => {})));

  // Delete the doc.
  const db = getAdminDb();
  if (db) {
    try {
      await db.collection('swings').doc(params.id).delete();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
    }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
