import 'server-only';
import crypto from 'crypto';

// MUST be exactly "__session" — Firebase Hosting strips every cookie EXCEPT
// one named __session before forwarding the request to Cloud Run (so that
// responses remain CDN-cacheable). Any other name (e.g. the old
// gb_liff_session) silently never reaches the server, so middleware sees the
// user as logged-out and bounces them back to /login in a loop.
// Ref: https://firebase.google.com/docs/hosting/manage-cache#using_cookies
export const LIFF_COOKIE_NAME = '__session';
export const LIFF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
// 2026-10-06：登録・ログインを LINE 公式アカウント経由だけにした際、それ以前に Web（Safari 等）で
// 作られたセッションを一括で無効にする（本人判断「ウェブの人は全員ログインし直しでよい」）。
// この時刻より前に発行されたトークンは期限内でも通さない。LINE の中の人は /liff で自動的に入り直す。
export const SESSION_MIN_ISSUED_AT = 1791266400000; // 2026-10-06T06:00:00Z（JST 15:00）

function sign(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function makeSessionToken(userId: string, secret: string) {
  const payload = `${userId}.${Date.now()}`;
  const sig = sign(payload, secret);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  const expected = sign(`${userId}.${ts}`, secret);
  if (expected !== sig) return null;
  const issued = parseInt(ts, 10);
  if (!Number.isFinite(issued) || issued < SESSION_MIN_ISSUED_AT) return null;
  if (Date.now() - issued > LIFF_COOKIE_MAX_AGE * 1000) return null;
  return userId;
}
