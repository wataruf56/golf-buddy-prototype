import { NextRequest, NextResponse } from 'next/server';
import { getNotifOverrides, saveNotifOverrides } from '@/lib/notificationTemplateStore';
import { NOTIF_TEMPLATES } from '@/lib/notificationTemplates';
import type { NotifChannels } from '@/lib/notificationTemplates';

// 管理者用：通知メッセージのテンプレート（デフォルト＋上書き）の取得/保存。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const overrides = await getNotifOverrides();
  return NextResponse.json({ templates: NOTIF_TEMPLATES, overrides }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const overrides = (body?.overrides && typeof body.overrides === 'object') ? body.overrides as Record<string, NotifChannels> : {};
  try {
    const saved = await saveNotifOverrides(overrides);
    return NextResponse.json({ ok: true, overrides: saved }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
