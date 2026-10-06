import 'server-only';
import { cookies } from 'next/headers';
import { isDemoMode } from './auth';
import { verifySessionToken, LIFF_COOKIE_NAME } from './liffSession';

export async function getMeId(): Promise<string | null> {
  if (isDemoMode) return 'me';
  // ログインは LIFF（LINE の中）で発行する __session Cookie だけ（2026-10-06）。
  // 以前は NextAuth（Web の LINE ログイン）のセッションも通していたが、Web のまま操作できる抜け道になるので外した。
  try {
    const c = cookies().get(LIFF_COOKIE_NAME);
    if (c?.value) {
      const secret = process.env.NEXTAUTH_SECRET || '';
      const userId = verifySessionToken(c.value, secret);
      if (userId) return userId;
    }
  } catch { /* noop */ }
  return null;
}
