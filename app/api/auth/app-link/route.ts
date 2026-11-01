import { NextRequest, NextResponse } from 'next/server';
import { LIFF_COOKIE_NAME, LIFF_COOKIE_MAX_AGE, makeSessionToken } from '@/lib/liffSession';
import { consumeAppLinkToken } from '@/lib/adminAppLink';

// 運営だけの「LINE を通さずに自分として開く」使い捨てリンク（lib/adminAppLink・2026-11-01）。
// GET  /api/auth/app-link?k=…&to=/sns … 「開く」ボタンだけの画面（ここではまだ使わない）。
//      LINE やメッセージに貼ったとき、プレビュー取得のアクセスでリンクを使い切られないようにするため。
// POST /api/auth/app-link（k, to）     … 正しければ __session を発行して to へ。ダメなら理由だけ出す。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate', 'X-Robots-Tag': 'noindex, nofollow' };

function safeTo(v: string | null): string {
  const to = String(v || '/sns');
  return to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\') ? to.slice(0, 300) : '/sns';
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function page(body: string, status = 200) {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ゴルトモ</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#F7F3EA;color:#1E2B27;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{background:#fff;border-radius:20px;padding:28px 22px;max-width:340px;width:calc(100% - 32px);text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.06)}
h1{font-size:17px;margin:0 0 8px}p{font-size:13px;color:#5B6B66;line-height:1.7;margin:0 0 18px}
button{width:100%;padding:14px;border:0;border-radius:14px;background:#E8643C;color:#fff;font-size:15px;font-weight:800}</style></head><body><div class="c">${body}</div></body></html>`;
  return new NextResponse(html, { status, headers: { ...noStore, 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const k = sp.get('k') || '';
  if (!k) return page('<h1>リンクが正しくありません</h1>', 400);
  return page(`<h1>運営アカウントで開く</h1><p>LINE を通さずに、ご自分のアカウントでアプリを開きます。<br>このリンクは1回だけ使えます。</p>
<form method="post" action="/api/auth/app-link"><input type="hidden" name="k" value="${esc(k)}"><input type="hidden" name="to" value="${esc(safeTo(sp.get('to')))}"><button type="submit">開く</button></form>`);
}

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET || '';
  const form = await req.formData().catch(() => null);
  const k = String(form?.get('k') || '');
  const to = safeTo(form ? String(form.get('to') || '') : null);
  const userId = secret && k ? await consumeAppLinkToken(k, secret) : null;
  if (!userId) {
    return page('<h1>このリンクは使えません</h1><p>期限（発行から10分）が切れたか、すでに1回使われています。<br>新しいリンクを発行してください。</p>', 403);
  }
  console.log('[app-link] admin signed in without LINE', userId.slice(0, 8));
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || 'app.goltomo.com').toLowerCase();
  // run.app（サーバー直通）で開いたときは run.app のまま（入口が遅いとき用・middleware の isDirectWithSession）
  const base = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? `http://${host}`
    : host.endsWith('.run.app') ? `https://${host}` : 'https://app.goltomo.com';
  const res = NextResponse.redirect(new URL(to, base), 303);
  res.cookies.set(LIFF_COOKIE_NAME, makeSessionToken(userId, secret), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: LIFF_COOKIE_MAX_AGE,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
