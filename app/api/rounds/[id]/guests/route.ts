import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import type { RoundGuest } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/guests — 名前つきゲスト（ゴルトモ未登録の同伴者）の名前変更。
//   { action:'rename', id, name }
// 主催者・共同管理者のみ。入金タブの ✏️ から使う。
// ※ゲストの「人数」は募集人数タブの「主催者の知り合い」で増減する（guests はその名札であり、
//   人数は externalMale/Female で数えているため、ここでは増減させない）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者・共同管理者のみ操作できます' }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const action = String(body.action || '');
  const guests: RoundGuest[] = [...(round.guests || [])];
  const patch: Partial<import('@/lib/types').Round> = {};

  if (action === 'rename') {
    const id = String(body.id || '');
    const name = String(body.name || '').trim().slice(0, 30);
    if (!id || !name) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    const g = guests.find((x) => x.id === id);
    if (!g) return NextResponse.json({ error: 'not_found', message: 'ゲストが見つかりません' }, { status: 404, headers: noStore });
    g.name = name;
    patch.guests = guests;
  } else {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400, headers: noStore });
  }

  await db.updateRound(params.id, patch as any);
  const updated = await db.getRound(params.id);
  return NextResponse.json({ round: updated }, { headers: noStore });
}
