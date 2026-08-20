import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// LP計測の共通基盤。トップLP / 診断LP / インスタハブ の3面から同じ形式で送る。
//
// 目的は「どの入口から来た人が、どこまで進んで、どこで落ちたか」を1本の
// ファネルで見ること。最終ゴールは LINE公式アカウントへ遷移するリンクの押下。
//
// 集計はすべて **ユニーク（visitorId 基準）**。同じ人が何度スクロールしても1人。
//
// 送るイベント：
//   view   … LPに到達した
//   scroll … スクロール深度に到達した（depth: 25/50/75/100）
//   click  … ボタンを押した（target で識別）
//   goal   … LINE公式へ遷移した（＝最終ゴール）
//   exit   … 離脱（dwellMs・maxScroll を添える）
//
// 面（page）と入口（entry）は別軸で持つ：
//   page  … top（普通のLP） / mbti（ゴルフMBTI診断LP） / links（インスタのリンクハブ）
//   entry … richmenu / instagram / search / line / internal / other / direct
export const dynamic = 'force-dynamic';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const PAGES = new Set(['top', 'mbti', 'links', 'rounds', 'liff']);
// step は LINEへ飛んだ後の段階（liff_open / liff_login / liff_signup / liff_error）
const EVENTS = new Set(['view', 'scroll', 'click', 'goal', 'exit', 'step']);
const ENTRIES = new Set(['richmenu', 'instagram', 'search', 'line', 'internal', 'other', 'direct']);

const s = (v: any, n = 80) => (v == null ? '' : String(v).slice(0, n));
const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    // sendBeacon は text/plain で飛んでくるので JSON.parse で受ける
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch { body = {}; }

  const event = s(body.event, 20);
  const page = s(body.page, 20);
  if (!EVENTS.has(event) || !PAGES.has(page)) {
    // 不正な値は静かに捨てる（計測が原因でLPが壊れないように常に200を返す）
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const entryRaw = s(body.entry, 20);
  const entry = ENTRIES.has(entryRaw) ? entryRaw : 'direct';

  const entryDoc = {
    visitorId: s(body.visitorId, 60),      // localStorage の永続ID（ユニーク計測の基盤）
    sessionId: s(body.sessionId, 60),      // sessionStorage のセッションID
    event, page, entry,
    ref: s(body.ref, 40),                  // ?ref= の生タグ（ig_bio / share_img など）
    referrerHost: s(body.referrerHost, 80),
    menu: s(body.menu, 40),                // ?e=（リッチメニューのボタン名）
    target: s(body.target, 40),            // click: どのボタンか
    step: s(body.step, 30),                // step: LINE遷移後のどの段階か
    note: s(body.note, 80),                // step: 失敗理由など
    depth: num(body.depth),                // scroll: 25/50/75/100
    dwellMs: num(body.dwellMs),            // exit: 滞在時間
    maxScroll: num(body.maxScroll),        // exit: 最大スクロール%
    // A/Bテストの割り当て（a=現行 / b=新案）。visitorId から決まり、同じ人には常に同じ面。
    variant: ['a', 'b'].includes(s(body.variant, 4)) ? s(body.variant, 4) : '',
    isMobile: body.isMobile ? 1 : 0,
    returning: body.returning ? 1 : 0,     // 2回目以降の訪問か
    ts: Date.now(),
    ua: req.headers.get('user-agent')?.slice(0, 200) || '',
  };

  try {
    const db = getAdminDb() as any;
    if (db) await db.collection('_lpTrack').add(entryDoc);
  } catch { /* 計測の失敗はユーザー体験に影響させない */ }

  return NextResponse.json({ ok: true }, { headers: cors });
}
