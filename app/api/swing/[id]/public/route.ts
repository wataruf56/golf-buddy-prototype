import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/swing/[id]/public — no auth required.
// Returns minimal fields for public sharing: review text, video URLs, mode, date.
// Owner-identifying or sensitive fields (userId, errorMessage, etc.) are stripped.
// `status: 'done'` only — analyzing/failed/queued docs return 404 to avoid leaking
// in-progress states.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  try {
    const snap = await db.collection('swings').doc(params.id).get();
    if (!snap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const d = snap.data() as any;
    if (d.status !== 'done') return NextResponse.json({ error: 'not_ready' }, { status: 404, headers: noStore });

    return NextResponse.json({
      swing: {
        swingId: d.swingId,
        mode: d.mode,
        videoGcsPath: d.videoGcsPath || '',
        proGcsPath: d.proGcsPath || '',
        prevGcsPath: d.prevGcsPath || '',
        rangeGcsPath: d.rangeGcsPath || '',
        reviewTextChunks: Array.isArray(d.reviewTextChunks) ? d.reviewTextChunks : [],
        snapshots: Array.isArray(d.snapshots) ? d.snapshots : [],
        createdAt: d.createdAt,
        completedAt: d.completedAt,
        // userMessage is intentionally exposed (it's part of the analysis context)
        userMessage: d.userMessage || '',
      },
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
