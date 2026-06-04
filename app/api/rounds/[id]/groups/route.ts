import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { RoundGroup } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/groups { groups }
// Host-only. Saves the competition group assignment (組分け + スタート時間).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ編集できます' }, { status: 403, headers: noStore });
  }

  let raw: any;
  try { raw = (await req.json())?.groups; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'groups must be an array' }, { status: 400, headers: noStore });

  // Sanitise: only allow real participants, keep at most 50 groups / 12 each.
  const participants = new Set<string>([round.hostId, ...(round.applicantIds || [])]);
  const seen = new Set<string>();
  const groups: RoundGroup[] = raw.slice(0, 50).map((g: any, i: number) => {
    const memberIds = Array.isArray(g?.memberIds)
      ? g.memberIds.filter((id: any) => typeof id === 'string' && participants.has(id) && !seen.has(id) && (seen.add(id), true)).slice(0, 12)
      : [];
    return {
      id: typeof g?.id === 'string' && g.id ? g.id.slice(0, 40) : `g_${i}`,
      startTime: typeof g?.startTime === 'string' ? g.startTime.slice(0, 10) : undefined,
      memberIds,
    };
  });

  await db.updateRound(params.id, { groups } as any);
  return NextResponse.json({ ok: true, groups }, { headers: noStore });
}
