import { NextRequest, NextResponse } from 'next/server';
import { renderFromOverrides, getTemplateDef, SAMPLE_VARS } from '@/lib/notificationTemplates';

// 管理者用：通知メッセージの「テスト送信」。編集中の文面をサンプル値で埋めて、
// 管理者（ADMIN_USER_IDS / ADMIN_NOTIFY_USER_IDS）本人へ実際に送る。
// 到達確認が目的なので通知設定（notifyPrefs）は無視して必ず送る。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

function adminIds(): string[] {
  const raw = (process.env.ADMIN_USER_IDS || process.env.ADMIN_NOTIFY_USER_IDS || '').trim();
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const key = String(body?.key || '');
  const def = getTemplateDef(key);
  if (!def) return NextResponse.json({ error: 'unknown_key' }, { status: 400, headers: noStore });

  const ids = adminIds();
  if (!ids.length) {
    return NextResponse.json({ error: 'no_admin', message: '管理者のLINEユーザーID（ADMIN_USER_IDS / ADMIN_NOTIFY_USER_IDS）が未設定です。' }, { status: 400, headers: noStore });
  }

  // 編集中の4項目をその場限りの上書きとして扱い、サンプル値を差し込む。
  const f = (body?.fields && typeof body.fields === 'object') ? body.fields : {};
  const oneOff = { [key]: { inApp: f.inApp, line: f.line, webTitle: f.webTitle, webBody: f.webBody } };
  const n = renderFromOverrides(key, oneOff, SAMPLE_VARS);

  const link = '/home';
  const [{ addNotification }, { pushTo, liffUrl }, { webPushText }] = await Promise.all([
    import('@/lib/notifications'), import('@/lib/linePush'), import('@/lib/webPush'),
  ]);

  await Promise.all(ids.map(async (id) => {
    try {
      if (n.inApp) await addNotification(id, def.key as any, `【テスト】${n.inApp}`, link).catch(() => {});
      // テスト到達確認のため設定に関わらず必ず送る。
      await pushTo(id, `🔔【テスト送信】${def.label}\n${n.line}`, liffUrl(link)).catch(() => {});
      await webPushText(id, `【テスト】${n.webTitle}`, n.webBody, link, `notiftest-${key}`).catch(() => {});
    } catch { /* 個別失敗は無視 */ }
  }));

  return NextResponse.json({ ok: true, sentTo: ids.length }, { headers: noStore });
}
