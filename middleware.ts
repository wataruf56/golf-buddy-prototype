import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ---------------------------------------------------------------------------
// Multi-domain routing + auth.
//
//   goltomo.com / www.goltomo.com  → marketing landing page (rewrite to /lp)
//   admin.goltomo.com              → /admin/* only (extra cookie auth in layout)
//   app.goltomo.com / *.vercel.app → the LIFF app (existing routes + auth)
//
// Auth (legacy NextAuth on the app host) is preserved for the same routes that
// were guarded before. Demo mode bypasses auth.
// ---------------------------------------------------------------------------

const APP_HOSTS = new Set([
  'app.goltomo.com',
  'golf-buddy-prototype.vercel.app',
]);
const LP_HOSTS = new Set(['goltomo.com', 'www.goltomo.com']);
const ADMIN_HOSTS = new Set(['admin.goltomo.com']);

// Routes on the app host that require LINE login.
const APP_PROTECTED_PREFIXES = [
  '/home', '/search', '/create', '/buddies', '/mypage',
  '/round', '/profile', '/chat', '/swing',
];

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function shouldRequireAppAuth(path: string): boolean {
  return APP_PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export default async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get('host') || '').toLowerCase();
  const path = url.pathname;

  // -------- LP host (goltomo.com / www.goltomo.com) --------
  if (LP_HOSTS.has(host)) {
    if (path.startsWith('/legal') || path === '/lp' || path.startsWith('/lp/') || path.startsWith('/icons/') || path === '/manifest.json' || path === '/favicon.ico') {
      return NextResponse.next();
    }
    // App or admin paths accidentally hit on LP host → bounce to the right host.
    if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL(`https://admin.goltomo.com${path}${url.search}`));
    }
    if (path.startsWith('/share') || path.startsWith('/liff') || path.startsWith('/api/')) {
      return NextResponse.redirect(new URL(`https://app.goltomo.com${path}${url.search}`));
    }
    // Everything else on LP host → render the LP (rewrite, keeps URL).
    return NextResponse.rewrite(new URL('/lp', req.url));
  }

  // -------- Admin host (admin.goltomo.com) --------
  if (ADMIN_HOSTS.has(host)) {
    if (path === '/' || path === '') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (
      path.startsWith('/admin') ||
      path.startsWith('/api/admin') ||
      path.startsWith('/api/auth/') ||
      path === '/liff' || path.startsWith('/liff/') ||
      path.startsWith('/icons/') || path === '/manifest.json' || path === '/favicon.ico'
    ) {
      // Pass the pathname into server components so the admin layout can
      // skip its auth check on /admin/login (avoid redirect loops).
      const headers = new Headers(req.headers);
      headers.set('x-pathname', path);
      return NextResponse.next({ request: { headers } });
    }
    return new NextResponse('not found', { status: 404 });
  }

  // -------- App host (or unknown) --------
  // Block /admin from the app host — admin can only be reached via admin.goltomo.com.
  if (path === '/admin' || path.startsWith('/admin/')) {
    return NextResponse.redirect(new URL(`https://admin.goltomo.com${path}${url.search}`));
  }

  // Apply legacy NextAuth check for protected app routes (mirrors the old behaviour).
  if (!isDemoMode && shouldRequireAppAuth(path)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    // Also accept the LIFF-issued session cookie as proof of login.
    const liffCookie = req.cookies.get('gb_liff_session');
    if (!token && !liffCookie) {
      // Send unauthenticated users to the LIFF URL so the app stays inside the
      // LINE in-app webview when launched from LINE. NextAuth's /login page
      // does web OAuth which iOS opens in Safari and breaks the LIFF context.
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
      if (liffId) {
        const target = `https://liff.line.me/${liffId}?to=${encodeURIComponent(path + (url.search || ''))}`;
        return NextResponse.redirect(target);
      }
      // Fallback if LIFF ID not configured: legacy /login.
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', path);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except static assets and Next internals.
    '/((?!_next/static|_next/image).*)',
  ],
};
