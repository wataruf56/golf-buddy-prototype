import 'server-only';
import crypto from 'crypto';

export const LIFF_COOKIE_NAME = 'gb_liff_session';
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
