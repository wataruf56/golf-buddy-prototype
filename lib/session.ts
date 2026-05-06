import 'server-only';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions, isDemoMode } from './auth';
import { verifySessionToken, LIFF_COOKIE_NAME } from './liffSession';

export async function getMeId(): Promise<string | null> {
  if (isDemoMode) return 'me';
  // 1) NextAuth session (PWA / OAuth path)
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;
  // 2) LIFF cookie (in-LINE webview path)
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
