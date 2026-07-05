import { NextRequest, NextResponse } from 'next/server';
import { getRematchConfig, setRematchConfig } from '@/lib/rematchConfig';
import { getAdminDb } from '@/lib/firebase';

// 管理者用：再会エンジンの設定取得/更新＋5段ファネル集計。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

async function funnelCounts(): Promise<Record<string, number>> {
  const db = getAdminDb() as any;
  const base = { rematch_notify_open: 0, rematch_input_one: 0, rematch_input_both: 0, rematch_agreed: 0, rematch_to_round_post: 0 };
  if (!db) return base;
  try {
    const snap = await db.collection('_rematchEvents').limit(5000).get();
    snap.docs.forEach((d: any) => { const e = d.data()?.event; if (e in base) (base as any)[e]++; });
  } catch { /* noop */ }
  return base;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const [config, funnel] = await Promise.all([getRematchConfig(), funnelCounts()]);
  return NextResponse.json({ config, funnel }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  try {
    const config = await setRematchConfig({
      intervalDays: body?.intervalDays,
      maxCycles: body?.maxCycles,
      candidateWindowDays: body?.candidateWindowDays,
      enabled: body?.enabled,
    });
    return NextResponse.json({ ok: true, config }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
