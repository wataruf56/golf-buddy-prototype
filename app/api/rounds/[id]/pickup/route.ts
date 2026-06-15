import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// 参加者（車あり）が自分の送迎できる駅を登録/更新する。主催者の pickupStations
// とは別枠で round.participantPickups[meId] に保存する。コンペ含めて利用可。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  // 主催者または承認済み参加者のみ。
  const members = new Set([round.hostId, ...(round.applicantIds || [])]);
  if (!members.has(meId)) {
    return NextResponse.json({ error: 'not a participant' }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const stations: string[] = Array.isArray(body?.stations)
    ? body.stations.map((x: any) => String(x).slice(0, 20)).filter(Boolean).slice(0, 20)
    : [];

  const next = { ...(round.participantPickups || {}) };
  if (stations.length) next[meId] = stations;
  else delete next[meId];

  try {
    await db.updateRound(params.id, { participantPickups: next } as any);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true, stations }, { headers: noStore });
}
