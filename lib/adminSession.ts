import 'server-only';
import crypto from 'crypto';

// Separate admin auth that does NOT depend on LIFF / LINE login.
// Admin uses a regular browser on admin.goltomo.com; LIFF webview redirect
// flows break out into Safari on iOS and lose their cookie scope, so we
// keep this completely independent.

// Must be "__session" — Firebase Hosting strips all other cookies before
// forwarding to Cloud Run. Admin lives on its own host (admin.goltomo.com),
// so sharing the name with the app's LIFF cookie is fine (separate cookie jar).
export const ADMIN_COOKIE_NAME = '__session';
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function makeAdminToken(secret: string) {
  const payload = `admin.${Date.now()}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminToken(token: string, secret: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tag, ts, sig] = parts;
  if (tag !== 'admin') return false;
  if (sign(`${tag}.${ts}`, secret) !== sig) return false;
  if (Date.now() - parseInt(ts, 10) > ADMIN_COOKIE_MAX_AGE * 1000) return false;
  return true;
}

// Constant-time password compare to avoid timing oracles.
export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
