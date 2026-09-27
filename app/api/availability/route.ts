import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAvailability, listAvailabilityFor, saveAvailability, normalizeDates, WINDOW_DAYS, todayJst, windowEndJst } from '@/lib/availability';
import { clampCarNum, needsStation, NEEDS_STATION_MSG } from '@/lib/availabilityShared';
import { onAvailabilityAdded, onAvailabilityRemoved, roomsFor } from '@/lib/availRooms';

// 「行ける日」。
//   GET  … 日付ごとの行ける人（同じ年代だけ）＋自分の選択。20〜30代でなければ enabled:false だけ返す。
//          needsStation:true なら、まだ最寄り駅が無いので「出す」ことはできない（見るのはできる）
//   POST … 自分の行ける日を保存 { dates: ['YYYY-MM-DD'...], car?: 'have'|'none', seats?: 2..8, bags?: 2..8 }
//          car はプロフィールを書き換える（この画面の「車あり／なし」はプロフィールと同じもの）
//          最寄り駅が未登録なら 403 needs_station（運営が駅の近さで組むため。2026-09-27）
//          { removeDate: 'YYYY-MM-DD' } はその日だけ外す（部屋の「行けなくなった」から）
//          押した日・外した日は lib/availRooms に渡す（4人でチャット部屋、5人目から合流、外れたら退室）
//          rooms … 自分が入っている日付ごとのチャット部屋 { 'YYYY-MM-DD': { id, count } }
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  const r = await listAvailabilityFor(me);
  if (r.cohort !== 'a') {
    // 20〜30代以外にはこの機能を出さない。何も並べず、理由も細かく言わない。
    return NextResponse.json({ enabled: false, byDate: {}, mine: [] }, { headers: noStore });
  }
  const rooms = await roomsFor(meId, r.mine).catch(() => ({}));
  return NextResponse.json({
    enabled: true,
    needsStation: needsStation(me),
    byDate: r.byDate,
    mine: r.mine,
    rooms,
    car: me.car === 'have' ? 'have' : 'none',
    seats: r.mineCar.seats ?? null,
    bags: r.mineCar.bags ?? null,
    // 女性はプロフィールを開ける。男性には名前もIDも渡していない（lib/availability）
    canOpenProfiles: me.gender === 'female',
    window: { from: todayJst(), to: windowEndJst(), days: WINDOW_DAYS },
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { getCohort } = await import('@/lib/ageGate');
  if (getCohort(me.age) !== 'a') {
    return NextResponse.json({ ok: false, message: 'この機能は20〜30代の会員向けです' }, { status: 403, headers: noStore });
  }

  if (needsStation(me)) {
    // 最寄り駅が無いと運営が乗り合い・集合駅を組めない。案内して、登録が済んだら使える
    return NextResponse.json({ ok: false, code: 'needs_station', message: NEEDS_STATION_MSG }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  if (!body || typeof body !== 'object') body = {};
  const prev = (await getAvailability(meId))?.dates || [];
  // dates を送ってこない（車の設定だけ変える）ときは、いまの日付を残す。removeDate はその日だけ外す
  const dates = Array.isArray(body.dates) ? normalizeDates(body.dates)
    : typeof body.removeDate === 'string' ? prev.filter((d) => d !== body.removeDate)
    : prev;
  const car = body.car === 'have' ? 'have' : body.car === 'none' ? 'none' : null;
  // seats / bags は「送ってこない＝触らない」「null や 2〜8 の外＝消す」
  const seats = 'seats' in body ? (clampCarNum(body.seats) ?? null) : undefined;
  const bags = 'bags' in body ? (clampCarNum(body.bags) ?? null) : undefined;

  const saved = await saveAvailability(meId, dates, { seats, bags });
  if (car && car !== me.car) {
    // 車あり／なしはプロフィールが正。ここで変えたらプロフィールも変わる（二重管理にしない）。
    try { await db.upsertUser({ ...me, car } as any); } catch { /* 車の更新に失敗しても日付は保存済み */ }
  }

  // 押した日は部屋へ（4人で作る・5人目から合流）、外した日は部屋から抜ける。失敗しても保存は済んでいる
  const meNow = { ...me, ...(car ? { car } : {}) } as any;
  const added = saved.dates.filter((d) => !prev.includes(d));
  const removed = prev.filter((d) => !saved.dates.includes(d));
  for (const d of added) await onAvailabilityAdded(meNow, d);
  for (const d of removed) await onAvailabilityRemoved(meNow, d);
  const rooms = await roomsFor(meId, saved.dates).catch(() => ({}));

  return NextResponse.json({
    ok: true, dates: saved.dates, car: car || (me.car === 'have' ? 'have' : 'none'),
    seats: saved.seats ?? null, bags: saved.bags ?? null, rooms,
  }, { headers: noStore });
}
