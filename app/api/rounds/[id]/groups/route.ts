import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { RoundGroup, RoundGuest } from '@/lib/types';

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

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const raw = body?.groups;
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'groups must be an array' }, { status: 400, headers: noStore });

  // ゲスト（ゴルトモ未登録・名前のみ）を先に確定。組み分けに含められる。
  // 既存の round.guests も温存しつつ、リクエストの guests で置き換える。
  const guests: RoundGuest[] = Array.isArray(body?.guests)
    ? body.guests
        .map((x: any) => ({
          id: (typeof x?.id === 'string' && x.id ? x.id : '').slice(0, 40),
          name: (typeof x?.name === 'string' ? x.name : '').trim().slice(0, 30),
        }))
        .filter((x: RoundGuest) => x.id.startsWith('gst_') && x.name)
        .slice(0, 60)
    : (round.guests || []);
  const guestIds = new Set(guests.map((g) => g.id));

  // メンバーは「実参加者（主催者＋承認済み）」または「確定済みゲスト」のみ許可。
  const participants = new Set<string>([round.hostId, ...(round.applicantIds || [])]);
  const allowed = (id: string) => participants.has(id) || guestIds.has(id);
  const seen = new Set<string>();
  const groups: RoundGroup[] = raw.slice(0, 50).map((g: any, i: number) => {
    const memberIds = Array.isArray(g?.memberIds)
      ? g.memberIds.filter((id: any) => typeof id === 'string' && allowed(id) && !seen.has(id) && (seen.add(id), true)).slice(0, 12)
      : [];
    return {
      id: typeof g?.id === 'string' && g.id ? g.id.slice(0, 40) : `g_${i}`,
      startTime: typeof g?.startTime === 'string' ? g.startTime.slice(0, 10) : undefined,
      memberIds,
    };
  });

  await db.updateRound(params.id, { groups, guests } as any);
  return NextResponse.json({ ok: true, groups, guests }, { headers: noStore });
}
