import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAvailability, listAvailabilityFor, saveAvailability, normalizeDates, WINDOW_DAYS, todayJst, windowEndJst } from '@/lib/availability';
import { clampCarNum, needsStation, NEEDS_STATION_MSG } from '@/lib/availabilityShared';

// 「行ける日」。
//   GET  … 日付ごとの行ける人（同じ年代だけ）＋自分の選択。20〜30代でなければ enabled:false だけ返す。
//          needsStation:true なら、まだ最寄り駅が無いので「出す」ことはできない（見るのはできる）
//   POST … 自分の行ける日を保存 { dates: ['YYYY-MM-DD'...], car?: 'have'|'none', seats?: 2..8, bags?: 2..8 }
//          car はプロフィールを書き換える（この画面の「車あり／なし」はプロフィールと同じもの）
//          最寄り駅が未登録なら 403 needs_station（運営が駅の近さで組むため。2026-09-27）
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
  return NextResponse.json({
    enabled: true,
    needsStation: needsStation(me),
    byDate: r.byDate,
    mine: r.mine,
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
  // dates を送ってこない（車の設定だけ変える）ときは、いまの日付を残す
  const dates = Array.isArray(body?.dates) ? normalizeDates(body.dates) : ((await getAvailability(meId))?.dates || []);
  const car = body?.car === 'have' ? 'have' : body?.car === 'none' ? 'none' : null;
  const seats = clampCarNum(body?.seats); const bags = clampCarNum(body?.bags);

  const saved = await saveAvailability(meId, dates, { seats, bags });
  if (car && car !== me.car) {
    // 車あり／なしはプロフィールが正。ここで変えたらプロフィールも変わる（二重管理にしない）。
    try { await db.upsertUser({ ...me, car } as any); } catch { /* 車の更新に失敗しても日付は保存済み */ }
  }

  return NextResponse.json({
    ok: true, dates: saved.dates, car: car || (me.car === 'have' ? 'have' : 'none'),
    seats: saved.seats ?? null, bags: saved.bags ?? null,
  }, { headers: noStore });
}
