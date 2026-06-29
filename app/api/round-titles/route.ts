import { NextRequest, NextResponse } from 'next/server';
import { getRoundTitlePresets, setRoundTitlePresets } from '@/lib/roundTitlesConfig';

// ラウンド募集タイトルの定型文（プルダウンの中身）。
// GET: 誰でも取得（create/edit 画面が参照）。POST: 管理者トークンが必要（編集）。
const noStore = { 'Cache-Control': 'no-store' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET() {
  try {
    const titles = await getRoundTitlePresets();
    return NextResponse.json({ ok: true, titles }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!Array.isArray(body?.titles)) {
    return NextResponse.json({ error: 'titles (array) required' }, { status: 400, headers: noStore });
  }
  try {
    const titles = await setRoundTitlePresets(body.titles);
    return NextResponse.json({ ok: true, titles }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
