import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import type { RoundGuest } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/guests — 名前つきゲスト（ゴルトモ未登録の同伴者）の管理。主催者・共同管理者のみ。
//   { action:'add',    name }        … 追加（参加確定として1枠。満員なら定員を+1）
//   { action:'rename', id, name }    … 名前の変更
//   { action:'remove', id }          … 削除（組み分け・当日欠席・入金チェックからも外す）
// これまでゲストはコンペの組み分け画面でしか作れなかったが、コンペ以外でも
// （入金管理などで）名前を付けて管理できるようにするための専用API。
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

  if (action === 'add') {
    const name = String(body.name || '').trim().slice(0, 30);
    if (!name) return NextResponse.json({ error: 'invalid', message: '名前を入力してください' }, { status: 400, headers: noStore });
    if (guests.length >= 60) return NextResponse.json({ error: 'too_many', message: 'ゲストが多すぎます' }, { status: 400, headers: noStore });
    const id = `gst_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    guests.push({ id, name });
    patch.guests = guests;
    // 参加確定メンバーが1人増える。空きが無ければ定員を広げる（共同管理者の追加と同じ方針）。
    const nextCount = (round.currentCount || 1) + 1;
    patch.currentCount = nextCount;
    const isDrink = round.eventType === 'drink';
    if (nextCount > (round.maxSpots || 0)) patch.maxSpots = Math.min(isDrink ? 99 : 50, nextCount);
  } else if (action === 'rename') {
    const id = String(body.id || '');
    const name = String(body.name || '').trim().slice(0, 30);
    if (!id || !name) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    const g = guests.find((x) => x.id === id);
    if (!g) return NextResponse.json({ error: 'not_found', message: 'ゲストが見つかりません' }, { status: 404, headers: noStore });
    g.name = name;
    patch.guests = guests;
  } else if (action === 'remove') {
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    if (!guests.some((x) => x.id === id)) {
      return NextResponse.json({ error: 'not_found', message: 'ゲストが見つかりません' }, { status: 404, headers: noStore });
    }
    patch.guests = guests.filter((x) => x.id !== id);
    patch.currentCount = Math.max(1, (round.currentCount || 1) - 1);
    // 組み分け・当日欠席・入金チェックからも外す（残骸を残さない）。
    if (round.groups?.length) {
      patch.groups = round.groups.map((g) => ({ ...g, memberIds: (g.memberIds || []).filter((m) => m !== id) }));
    }
    if (round.noShowIds?.length) patch.noShowIds = round.noShowIds.filter((x) => x !== id);
    if (round.paidIds?.length) patch.paidIds = round.paidIds.filter((x) => x !== id);
  } else {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400, headers: noStore });
  }

  await db.updateRound(params.id, patch as any);
  const updated = await db.getRound(params.id);
  return NextResponse.json({ round: updated }, { headers: noStore });
}
