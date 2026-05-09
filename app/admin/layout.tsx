import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE_NAME, verifyAdminToken } from '@/lib/adminSession';

// Server-side gate for /admin/*.
// Admin auth is independent of LIFF/LINE (see lib/adminSession.ts for why).
// A signed cookie issued by /api/admin/auth/login proves admin status.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Skip auth check on the login page itself (set by middleware on the admin host).
  const pathname = headers().get('x-pathname') || '';
  if (pathname === '/admin/login' || pathname === '/admin/login/') {
    return <>{children}</>;
  }

  const c = cookies().get(ADMIN_COOKIE_NAME);
  const secret = process.env.NEXTAUTH_SECRET || '';
  const ok = c?.value ? verifyAdminToken(c.value, secret) : false;

  if (!ok) {
    redirect('/admin/login');
  }

  return <>{children}</>;
}
