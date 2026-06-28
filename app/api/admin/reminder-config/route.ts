import { NextRequest, NextResponse } from 'next/server';
import { getReminderDaysBefore, setReminderDaysBefore } from '@/lib/roundReminderConfig';

// 管理者用：開催前リマインドの「開催の何日前に全体へ通知するか」を取得/設定。
const noStore = { 'Cache-Control': 'no-store' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  try {
    const daysBefore = await getReminderDaysBefore();
    return NextResponse.json({ ok: true, daysBefore }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!Array.isArray(body?.daysBefore)) {
    return NextResponse.json({ error: 'daysBefore (array) required' }, { status: 400, headers: noStore });
  }
  try {
    const daysBefore = await setReminderDaysBefore(body.daysBefore);
    return NextResponse.json({ ok: true, daysBefore }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
