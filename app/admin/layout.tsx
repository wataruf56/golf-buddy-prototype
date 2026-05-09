import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LIFF_COOKIE_NAME, verifySessionToken } from '@/lib/liffSession';
import { isAdminUserId } from '@/lib/adminAccess';

// Server-side gate for /admin/*.
// Checks the LIFF session cookie and verifies the userId is in the admin allow-list.
// If not authenticated → redirect to /admin/login (LIFF bridge that issues the cookie).
//
// The legacy `?token=...` URL parameter still works for individual admin API calls
// (kept for backwards compatibility / scripting), but the UI always requires LINE auth.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Skip auth check on the login page itself (set by middleware on the admin host).
  const pathname = headers().get('x-pathname') || '';
  if (pathname === '/admin/login' || pathname === '/admin/login/') {
    return <>{children}</>;
  }

  const c = cookies().get(LIFF_COOKIE_NAME);
  const secret = process.env.NEXTAUTH_SECRET || '';
  const userId = c?.value ? verifySessionToken(c.value, secret) : null;

  if (!userId) {
    redirect('/admin/login');
  }
  if (!isAdminUserId(userId)) {
    return (
      <div className="min-h-screen bg-bg p-8 max-w-md mx-auto">
        <div className="bg-card rounded-card p-6 shadow-card text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-base font-black mb-2">アクセス権がありません</div>
          <div className="text-[12px] text-sub leading-relaxed mb-4">
            この管理画面は許可された LINE アカウントのみ閲覧できます。<br />
            ログイン中のユーザー: <code className="text-[10px] break-all">{userId.slice(0, 12)}...</code>
          </div>
          <a href="/admin/login" className="inline-block px-4 py-2 bg-bg border-[1.5px] border-border rounded-lg text-xs font-bold">別アカウントでログイン</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
