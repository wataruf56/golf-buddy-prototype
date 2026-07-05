import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSession, saveSession, membersOfPair } from '@/lib/rematch';

// POST /api/rematch/[pairId]/optout — この相手との再会通知を今後止める。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(_req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });

  const optedOutBy = Array.from(new Set([...(s.optedOutBy || []), meId]));
  await saveSession(pairId, { optedOutBy, status: 'optedout' } as any);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
