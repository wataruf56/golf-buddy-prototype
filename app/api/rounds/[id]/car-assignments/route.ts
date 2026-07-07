import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { CarAssignment } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/car-assignments { assignments }
// Host-only. Saves the car dispatch (配車) — which passengers ride in each car.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ編集できます' }, { status: 403, headers: noStore });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const raw = body?.assignments;
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'assignments must be an array' }, { status: 400, headers: noStore });

  // 乗車できるのは「実参加者（主催者＋承認済み）」または「確定済みゲスト」のみ。
  const guestIds = new Set((round.guests || []).map((g) => g.id));
  const participants = new Set<string>([round.hostId, ...(round.applicantIds || [])]);
  const allowed = (id: string) => participants.has(id) || guestIds.has(id);

  // 各乗客はひとつの車にのみ。運転者IDも重複させない。
  const seenDriver = new Set<string>();
  const seenPassenger = new Set<string>();
  const assignments: CarAssignment[] = raw.slice(0, 30).map((a: any) => {
    const driverId = typeof a?.driverId === 'string' && allowed(a.driverId) && !seenDriver.has(a.driverId)
      ? (seenDriver.add(a.driverId), a.driverId) : '';
    const passengerIds = Array.isArray(a?.passengerIds)
      ? a.passengerIds.filter((id: any) =>
          typeof id === 'string' && allowed(id) && id !== driverId && !seenPassenger.has(id) && (seenPassenger.add(id), true)
        ).slice(0, 8)
      : [];
    return {
      driverId,
      passengerIds,
      station: typeof a?.station === 'string' && a.station.trim() ? a.station.trim().slice(0, 20) : undefined,
    };
  }).filter((a: CarAssignment) => a.driverId);

  await db.updateRound(params.id, { carAssignments: assignments } as any);
  return NextResponse.json({ ok: true, assignments }, { headers: noStore });
}
