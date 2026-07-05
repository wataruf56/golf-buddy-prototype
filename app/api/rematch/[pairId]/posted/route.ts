import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSession, saveSession, membersOfPair, recordRematchEvent } from '@/lib/rematch';

// POST /api/rematch/[pairId]/posted  body: { roundId }
// ⑥ 再会からラウンドが立ったことを記録（ファネル最終段 rematch_to_round_post）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const roundId = String(body?.roundId || '').slice(0, 60);

  await saveSession(pairId, { postedRoundId: roundId || s.postedRoundId || null, status: 'posted' } as any);
  recordRematchEvent('rematch_to_round_post', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});
  return NextResponse.json({ ok: true }, { headers: noStore });
}
