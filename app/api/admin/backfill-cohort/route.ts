import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { getCohort } from '@/lib/ageGate';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/admin/backfill-cohort?token=XXX[&apply=1]
// Scans rounds without `hostCohort`, looks up the host's age, computes the cohort,
// and writes it back. Without `apply=1` it returns a dry-run preview.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  const apply = url.searchParams.get('apply') === '1';

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  try {
    const snap = await db.collection('rounds').get();
    const targets: Array<{ id: string; hostId: string; age?: number; cohort?: string; reason?: string }> = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.hostCohort) continue; // already stamped, skip
      const hostId = data.hostId;
      if (!hostId) {
        targets.push({ id: doc.id, hostId: '(none)', reason: 'no_hostId' });
        continue;
      }
      const userSnap = await db.collection('users').doc(hostId).get();
      if (!userSnap.exists) {
        targets.push({ id: doc.id, hostId, reason: 'host_not_found' });
        continue;
      }
      const age = userSnap.data().age;
      const cohort = getCohort(age);
      if (!cohort) {
        targets.push({ id: doc.id, hostId, age, reason: 'host_out_of_cohort' });
        continue;
      }
      targets.push({ id: doc.id, hostId, age, cohort });
    }

    let written = 0;
    if (apply) {
      const batch = db.batch();
      for (const t of targets) {
        if (t.cohort) {
          batch.set(db.collection('rounds').doc(t.id), { hostCohort: t.cohort }, { merge: true });
          written++;
        }
      }
      if (written > 0) await batch.commit();
    }

    return NextResponse.json({
      total: snap.size,
      candidates: targets.length,
      writableNow: targets.filter((t) => t.cohort).length,
      written,
      dryRun: !apply,
      details: targets.slice(0, 50),
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
