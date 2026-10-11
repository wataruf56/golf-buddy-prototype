import { NextRequest, NextResponse } from 'next/server';
import { nudgeQuietRooms } from '@/lib/availRooms';

// 管理者用：行ける日の部屋への運営の声かけ（lib/availRooms.nudgeQuietRooms）をいま走らせる（2026-10-11）
//   POST { roomId?, force? } … force:true で時間帯（10〜21時）と「部屋ができて3時間」を無視する（確認用）
//   ふだんは housekeeping の cron が15分ごとに走らせる
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const r = await nudgeQuietRooms({ force: !!body.force, ...(body.roomId ? { roomId: String(body.roomId) } : {}) });
  return NextResponse.json({ ok: true, ...r }, { headers: noStore });
}
