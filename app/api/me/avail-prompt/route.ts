import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { activeAvailPromptFor, markAvailPromptSeen } from '@/lib/availPrompt';

// 「行ける日を入力してみませんか？」のポップアップ（lib/availPrompt）（2026-10-11）
//   GET  … いま出すもの { prompt: { roundId, title, date } | null }
//   POST … { roundId } 見た（入力する／閉じる）。もう出さない
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ prompt: null }, { headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ prompt: null }, { headers: noStore });
  const prompt = await activeAvailPromptFor(me).catch(() => null);
  return NextResponse.json({ prompt }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const roundId = String(body.roundId || '');
  if (!roundId) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  await markAvailPromptSeen(meId, roundId);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
