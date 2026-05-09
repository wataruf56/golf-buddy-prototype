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
      // Always go through /liff (same origin). It's safe both inside the LINE
      // in-app webview (LIFF SDK runs natively) and in plain browsers (the
      // SDK falls back to LINE Login web OAuth in the same window).
      // We deliberately do NOT redirect to https://liff.line.me/{id} from the
      // server — that's a cross-origin jump and iOS sometimes opens it in a
      // brand-new Safari tab even when the user came from the LINE webview,
      // which breaks the cookie chain.
      const liffUrl = new URL('/liff', req.url);
      liffUrl.searchParams.set('to', path + (url.search || ''));
      return NextResponse.redirect(liffUrl);
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
