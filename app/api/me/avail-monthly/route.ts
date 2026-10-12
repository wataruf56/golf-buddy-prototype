import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { monthlyPromptFor, markMonthlySeen } from '@/lib/availMonthly';

// 毎月の「行ける日を入れませんか？」のポップアップ（lib/availMonthly）（2026-10-12）
//   GET  … { prompt: { key, months, title, body } | null }
//   POST { key } … 見た（入力する／閉じる）。その月はもう出さない
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ prompt: null }, { headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ prompt: null }, { headers: noStore });
  return NextResponse.json({ prompt: await monthlyPromptFor(me).catch(() => null) }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const key = String(body.key || '');
  if (!/^\d{4}-\d{2}$/.test(key)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  await markMonthlySeen(meId, key);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
