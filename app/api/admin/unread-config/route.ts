import { NextRequest, NextResponse } from 'next/server';
import { getUnreadConfig, saveUnreadConfig, runUnreadDigest } from '@/lib/unreadDigest';

// 管理画面：未読まとめ通知の設定（送信タイミング＝経過時間・ON/OFF・通知文）。
//   GET  ?token=..                → 現在の設定
//   POST ?token=.. { enabled, delayMinutes, messageText } → 保存して最新設定を返す
//   POST ?token=.. { action:'run' }                        → 今すぐ送信（delay無視・重複防止は有効）
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const config = await getUnreadConfig();
  return NextResponse.json({ config }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* ignore */ }

  // 「今すぐ送信」：delay を無視して即時実行（重複防止は効くので連打しても増殖しない）。
  if (body.action === 'run') {
    const result = await runUnreadDigest({ force: true });
    return NextResponse.json({ ok: true, result }, { headers: noStore });
  }

  const patch: any = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.delayMinutes != null) patch.delayMinutes = body.delayMinutes;
  if (typeof body.messageText === 'string') patch.messageText = body.messageText;
  const config = await saveUnreadConfig(patch);
  return NextResponse.json({ ok: true, config }, { headers: noStore });
}
