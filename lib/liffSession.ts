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
  if (Date.now() - parseInt(ts, 10) > LIFF_COOKIE_MAX_AGE * 1000) return null;
  return userId;
}
