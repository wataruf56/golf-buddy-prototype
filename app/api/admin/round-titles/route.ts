import { NextRequest, NextResponse } from 'next/server';
import { getRoundTitlePresets, setRoundTitlePresets } from '@/lib/roundTitlesConfig';

// 管理画面用：ラウンド募集タイトルの定型文（プルダウンの中身）を取得/設定。
// admin.goltomo.com では middleware が /api/admin/* のみ通すため、公開GETの
// /api/round-titles とは別にこのルートを用意している（中身は同じ設定を読む）。
const noStore = { 'Cache-Control': 'no-store' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
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
