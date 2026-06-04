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
// Routes that REQUIRE login. Note: round detail (/round/[id]) and profiles
// (/profile/[id]) are intentionally NOT here — shared links must open & be
// viewable without login. Login is requested only when the visitor takes an
// action. The round GROUP CHAT (/round/[id]/chat) stays login+participant
// gated (handled in shouldRequireAppAuth).
const APP_PROTECTED_PREFIXES = [
  '/home', '/search', '/create', '/buddies', '/mypage',
  '/chat', '/swing',
];

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function shouldRequireAppAuth(path: string): boolean {
  // Round group chat is participant-only → always require login (the API also
  // enforces participant membership).
  if (/^\/round\/[^/]+\/chat(\/|$)/.test(path)) return true;
  // Round edit is host-only → require login (the API also enforces host).
  if (/^\/round\/[^/]+\/edit(\/|$)/.test(path)) return true;
  return APP_PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

export default async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  // Prefer x-forwarded-host: when Firebase Hosting proxies to Cloud Run it
  // puts the ORIGINAL domain (goltomo.com / app. / admin.) here while `host`
  // becomes the internal *.run.app hostname. On Vercel x-forwarded-host equals
  // the request host, so preferring it is safe on both platforms. This keeps
  // the host-based routing below working after the GCP migration.
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
  const path = url.pathname;

  // -------- LP host (goltomo.com / www.goltomo.com) --------
  if (LP_HOSTS.has(host)) {
    if (path.startsWith('/legal') || path === '/lp' || path.startsWith('/lp/') || path.startsWith('/icons/') || path === '/manifest.json' || path === '/favicon.ico') {
      return NextResponse.next();
    }
    // Branded launch URL: goltomo.com/app → LIFF entry. Lets us share a
    // friendly URL on the goltomo.com domain instead of liff.line.me/{id}.
    // Preserves ?to=/some/path so deep links keep working. We hardcode the
    // LIFF id as a fallback because NEXT_PUBLIC_* envs aren't always inlined
    // into Edge middleware bundles, and falling through to the LP rewrite
    // would silently swallow the launch URL. Same id is in lp/page.tsx.
    if (path === '/app' || path.startsWith('/app/')) {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2009973733-P5UdNex9';
      const to = url.searchParams.get('to');
      const target = `https://liff.line.me/${liffId}${to ? `?to=${encodeURIComponent(to)}` : ''}`;
      return NextResponse.redirect(target);
    }
    // App or admin paths accidentally hit on LP host → bounce to the right host.
    if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL(`https://admin.goltomo.com${path}${url.search}`));
    }
    if (
      path.startsWith('/share') || path.startsWith('/liff') || path.startsWith('/api/') ||
      path.startsWith('/round') || path.startsWith('/profile')
    ) {
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

  // Apply legacy NextAuth check for protected app routes — identical to the
  // pre-domain-migration behaviour: unauthenticated users go to /login, where
  // signIn('line') runs NextAuth's web OAuth in the same window. Inside the
  // LINE in-app webview this stays in-webview; in a normal browser it stays
  // in that browser. No cross-origin hops, no Safari hand-off.
  if (!isDemoMode && shouldRequireAppAuth(path)) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    // Also accept the LIFF-issued session cookie as proof of login.
    // Cookie name must match lib/liffSession.ts (now "__session" so Firebase
    // Hosting forwards it to Cloud Run instead of stripping it).
    const liffCookie = req.cookies.get('__session');
    if (!token && !liffCookie) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', path + (url.search || ''));
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
