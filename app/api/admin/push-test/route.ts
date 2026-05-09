import { NextRequest, NextResponse } from 'next/server';

// GET /api/admin/push-test?token=XXX&userId=Uxxx
// Verifies env + tries pushing "test" to userId. Returns full LINE response.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
  const botBasicId = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID || '';

  const env = {
    hasAccessToken: !!accessToken,
    accessTokenLength: accessToken.length,
    hasChannelSecret: !!channelSecret,
    botBasicId,
  };

  // Step 1: ping /v2/bot/info to verify token validity
  let botInfo: any = null;
  let botInfoStatus = 0;
  if (accessToken) {
    try {
      const r = await fetch('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      botInfoStatus = r.status;
      botInfo = await r.json();
    } catch (e) {
      botInfo = { error: (e as Error).message };
    }
  }

  // Step 2: optional push test
  const userId = url.searchParams.get('userId') || '';
  let pushResult: any = null;
  let pushStatus = 0;
  if (userId && accessToken) {
    try {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          to: userId,
          messages: [{ type: 'text', text: '🏌️ ゴルトモ テスト通知です。届いたら成功！' }],
        }),
      });
      pushStatus = r.status;
      const txt = await r.text();
      try { pushResult = JSON.parse(txt); } catch { pushResult = txt; }
    } catch (e) {
      pushResult = { error: (e as Error).message };
    }
  }

  return NextResponse.json({ env, botInfo, botInfoStatus, pushResult, pushStatus });
}
