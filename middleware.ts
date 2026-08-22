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
  '/chat', '/swing', '/rematch',
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
    // 静的アセット（画像・CSS・JS・フォント等）は public/ からそのまま配信。
    // これを通さないと LP(/lp や golmoti.html)が参照する画像が /lp の HTML に
    // 書き換えられてしまう（例: /line-logo.png）。
    if (/\.(png|jpe?g|webp|svg|gif|ico|css|js|mjs|map|woff2?|ttf|otf|json|txt|xml|mp4|webm)$/i.test(path)) {
      return NextResponse.next();
    }
    // /type と /type/[code] は SEO用の公開ページ（ゴルフ版MBTI 16タイプ）。
    // ここで通さないと、下の「それ以外は /lp に rewrite」に飲まれて LP が出てしまう。
    if (path.startsWith('/legal') || path === '/lp' || path.startsWith('/lp/') || path.startsWith('/icons/') || path.startsWith('/golmoti-chars/') || path === '/manifest.json' || path === '/favicon.ico' || path === '/golmoti' || path === '/golmoti.html' || path === '/golmoti-lp' || path === '/golmoti-lp.html' || path === '/type' || path.startsWith('/type/') || path === '/about' || path === '/data' || path === '/guide' || path.startsWith('/guide/')) {
      return NextResponse.next();
    }
    // 短縮URL: goltomo.com/mbti → 診断LP（golmoti.html）。
    // インスタのプロフィールリンクは「https://を含め30文字以内」制限があり、
    // /golmoti.html?ref=ig_bio (43字) は貼れないため、この24文字URLを経由させる。
    // 既定で ref=ig_bio を付与（インスタbio用）。?ref= 指定があればそちらを優先。
    // 短縮URL: goltomo.com/rounds → 募集中のラウンド一覧（ログイン不要で中身が読める）。
    // インスタのプロフィールに貼る用。リンクは「https://を含め30文字以内」の制限があり、
    // app.goltomo.com/links/rounds（36字）は貼れないため、この26文字のURLを経由させる。
    if (path === '/rounds') {
      const ref = (url.searchParams.get('ref') || 'ig_rounds').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40) || 'ig_rounds';
      return NextResponse.redirect(new URL(`https://app.goltomo.com/links/rounds?ref=${ref}`));
    }
    if (path === '/mbti') {
      const ref = (url.searchParams.get('ref') || 'ig_bio').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40) || 'ig_bio';
      return NextResponse.redirect(new URL(`/golmoti.html?ref=${ref}`, req.url));
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
      // 流入経路タグ（?ref= / ?utm_source=）をLIFF URLへ引き継ぐ。localStorageは
      // goltomo.com→app.goltomo.com のオリジンをまたげないため、URLで運ぶのが確実。
      const ref = (url.searchParams.get('ref') || url.searchParams.get('utm_source') || url.searchParams.get('source') || '')
        .toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
      // リッチメニューの入口タグ（?e=）も引き継ぐ（どのボタンから入ったか計測用）。
      const e = (url.searchParams.get('e') || '').toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
      // LPで採番した visitorId。これを引き継がないと LP側の計測と LIFF側の計測が
      // 別人として記録され、「LINEへ進んだ人のうち何人が登録まで来たか」を人単位で
      // 追えない（localStorage はオリジンをまたげない）。
      const v = (url.searchParams.get('v') || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 40);
      const qs = new URLSearchParams();
      if (to) qs.set('to', to);
      if (ref) qs.set('ref', ref);
      if (e) qs.set('e', e);
      if (v) qs.set('v', v);
      const lp = (url.searchParams.get('lp') || '').replace(/[^a-z]/g, '').slice(0, 20);
      if (lp) qs.set('lp', lp);
      const q = qs.toString();
      const target = `https://liff.line.me/${liffId}${q ? `?${q}` : ''}`;
      return NextResponse.redirect(target);
    }
    // App or admin paths accidentally hit on LP host → bounce to the right host.
    if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
      return NextResponse.redirect(new URL(`https://admin.goltomo.com${path}${url.search}`));
    }
    if (
      path.startsWith('/share') || path.startsWith('/liff') || path.startsWith('/api/') ||
      path.startsWith('/round') || path.startsWith('/profile') || path.startsWith('/poll') ||
      path.startsWith('/add-friend') || path.startsWith('/qr')
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
      path.startsWith('/api/lp/') ||
      path.startsWith('/api/auth/') ||
      path === '/liff' || path.startsWith('/liff/') ||
      path.startsWith('/icons/') || path === '/manifest.json' || path === '/favicon.ico' ||
      path === '/apple-touch-icon.png' || path === '/icon-256.png'
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
