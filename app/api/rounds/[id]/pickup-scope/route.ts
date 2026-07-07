import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { PickupInputScope } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store' };
const VALID = new Set<PickupInputScope>(['self', 'host', 'all']);

// POST /api/rounds/[id]/pickup-scope { userId, scope }
// 主催者のみ。各メンバーのピックアップ回答を「入力できる人の範囲」を設定する。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ設定できます' }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const userId = String(body?.userId || '');
  const scope = body?.scope as PickupInputScope;
  const targets = new Set([round.hostId, ...(round.applicantIds || []), ...((round.guests || []).map((g) => g.id))]);
  if (!targets.has(userId) || !VALID.has(scope)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }

  await db.updateRound(params.id, { pickupInputScope: { [userId]: scope } } as any);
  return NextResponse.json({ ok: true, userId, scope }, { headers: noStore });
}
