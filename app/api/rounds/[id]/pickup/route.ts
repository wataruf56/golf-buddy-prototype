import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { PickupStatus } from '@/lib/types';

// 参加者が自分のピックアップ回答（status＋駅）を登録/更新する。主催者の
// pickupStations とは別枠で round.participantPickups[meId] に保存する。コンペ含め可。
//   status='can' : 送れる駅＋定員 / 'want': 希望する駅 / 'cannot','no_need': 駅なし
const noStore = { 'Cache-Control': 'no-store' };
const VALID_STATUS = new Set<PickupStatus>(['can', 'cannot', 'want', 'no_need']);

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
  // 入力できるのは主催者（誰の分でも代理可）か本人（自分の分のみ）だけ。ゲストは主催者のみ。
  const isHost = round.hostId === meId;
  const proxyTargets = new Set([...members, ...((round.guests || []).map((g) => g.id))]);
  const targetId = body?.userId ? String(body.userId) : meId;
  if (targetId !== meId && !proxyTargets.has(targetId)) {
    return NextResponse.json({ error: 'bad_target' }, { status: 400, headers: noStore });
  }
  const permitted = isHost || targetId === meId;
  if (!permitted) {
    return NextResponse.json({ error: 'forbidden', message: '入力する権限がありません' }, { status: 403, headers: noStore });
  }
  const status: PickupStatus | undefined = VALID_STATUS.has(body?.status) ? body.status : undefined;
  // 駅は「可能」「してほしい」のときだけ意味を持つ。
  const rawStations: string[] = Array.isArray(body?.stations)
    ? body.stations.map((x: any) => String(x).slice(0, 20)).filter(Boolean).slice(0, 20)
    : [];
  const stations = (status === 'can' || status === 'want' || (!status && rawStations.length)) ? rawStations : [];
  // 定員は「送迎可能」のときだけ。
  const capacity = status === 'can' && typeof body?.capacity === 'number' && body.capacity > 0
    ? Math.min(8, Math.floor(body.capacity)) : undefined;

  const next = { ...(round.participantPickups || {}) };
  if (status) {
    // ステータスが選ばれていれば、駅が無くても回答として記録する（不要/不可の保持）。
    next[targetId] = { status, stations, ...(capacity ? { capacity } : {}) };
  } else if (stations.length) {
    // 後方互換：status未指定で駅だけ来たら従来どおり保存。
    next[targetId] = { stations, ...(capacity ? { capacity } : {}) };
  } else {
    delete next[targetId];
  }

  try {
    await db.updateRound(params.id, { participantPickups: next } as any);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true, targetId, status, stations, capacity }, { headers: noStore });
}
