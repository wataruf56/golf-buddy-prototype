import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { LIFF_COOKIE_NAME, verifySessionToken } from '@/lib/liffSession';

export default function RootPage() {
  // If the user already has a LIFF session, go straight to /home (no LIFF round-trip).
  const c = cookies().get(LIFF_COOKIE_NAME);
  const secret = process.env.NEXTAUTH_SECRET || '';
  const userId = c?.value ? verifySessionToken(c.value, secret) : null;
  if (userId) redirect('/home');

  // Otherwise hand off to LIFF so the LINE in-app webview opens the app properly.
  // Visiting app.goltomo.com directly in Safari would otherwise dead-end on /login.
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
  if (liffId) redirect(`https://liff.line.me/${liffId}?to=${encodeURIComponent('/home')}`);
  redirect('/home');
}
