import { NextRequest, NextResponse } from 'next/server';

const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'Content-Type': 'application/json; charset=utf-8' };
const LINE = 'https://api.line.me/v2/bot';

function auth(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}
function headers() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}
async function lineGet(path: string) {
  try {
    const r = await fetch(`${LINE}${path}`, { headers: headers() });
    const text = await r.text();
    let body: any; try { body = JSON.parse(text); } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: (e as Error).message }; }
}

// GET /api/admin/line?token=ADMIN_LOG_TOKEN
// 読み取り専用：公式アカウント情報（Basic ID＝友だち追加URL用）と
// 現在のリッチメニュー一覧／デフォルト設定を返す。破壊的変更なし。
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'no LINE_CHANNEL_ACCESS_TOKEN on server' }, { status: 500, headers: noStore });
  }
  const info = await lineGet('/info');
  const list = await lineGet('/richmenu/list');
  const def = await lineGet('/user/all/richmenu'); // デフォルトのリッチメニューID
  const basicId = info.ok ? info.body?.basicId : null;
  return NextResponse.json({
    botInfo: info.body,
    friendAddUrl: basicId ? `https://line.me/R/ti/p/${basicId}` : null,
    defaultRichMenu: def.body,
    richMenus: list.body,
    _status: { info: info.status, list: list.status, def: def.status },
  }, { headers: noStore });
}
