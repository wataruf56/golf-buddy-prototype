import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { PICKUP_STATIONS } from '@/lib/stations';
import {
  canAskDriver, createThreadForDriver, DRIVER_ASK_BODY, DRIVER_ASK_TITLE,
  DRIVER_SNOOZE_DAYS, saveDriverStations, snoozeDriverAsk,
} from '@/lib/proxyRecruit';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 管理者の代理ラウンド募集：ドライバー側の入口。
//
//   GET  … この人に「車を出せますか」と聞いてよいか（ホームの声かけ用）
//   POST … 拾える駅を登録する → **その場で枠が立ち、本人が最初のメンバーになる**
//          { stations: string[] }        駅を登録して枠を立てる
//          { snooze: true }              「あとで」。7日間聞かない
//
// 枠を人手で作らせないのがこの機能の肝なので、駅を選んだ瞬間に募集が始まる。

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ show: false }, { headers: noStore });

  const me = await db.getUser(meId);
  if (!canAskDriver(me)) return NextResponse.json({ show: false }, { headers: noStore });

  return NextResponse.json({
    show: true,
    title: DRIVER_ASK_TITLE,
    body: DRIVER_ASK_BODY,
    stations: PICKUP_STATIONS,
    snoozeDays: DRIVER_SNOOZE_DAYS,
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  if (body?.snooze) {
    await snoozeDriverAsk(meId);
    return NextResponse.json({ ok: true, snoozed: true }, { headers: noStore });
  }

  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  // 「車あり」の人にだけ聞いている機能なので、ここでも念のため確かめる。
  if (me.car !== 'have') {
    return NextResponse.json({
      ok: false, message: 'プロフィールで「車あり」の方だけが登録できます',
    }, { status: 400, headers: noStore });
  }

  // 選べるのは用意した駅だけ。自由入力を許すと表記ゆれで突き合わせられなくなる。
  const allowed = new Set(PICKUP_STATIONS);
  const stations = (Array.isArray(body?.stations) ? body.stations : [])
    .map((s: any) => String(s))
    .filter((s: string) => allowed.has(s));
  if (!stations.length) {
    return NextResponse.json({
      ok: false, message: '拾える駅を1つ以上選んでください',
    }, { status: 400, headers: noStore });
  }

  const saved = await saveDriverStations(meId, stations);
  const res = await createThreadForDriver({ ...me, driverPickup: { stations: saved, at: Date.now() } }, saved);
  if (!res.ok) return NextResponse.json({ ok: false, message: res.message }, { status: 409, headers: noStore });

  // 出入りのログ。ドライバー本人も「入った」1人として残す。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: res.round.id, targetName: res.round.title,
      summary: `「${res.round.title}」に入った（車を出す人）`,
      detail: { by: 'self', role: 'driver', stations: saved, official: true },
    }, req);
  } catch { /* ログの失敗で登録を止めない */ }

  return NextResponse.json({
    ok: true, id: res.round.id, title: res.round.title, stations: saved,
  }, { headers: noStore });
}
