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

  // -------- 検索エンジンに見せるホストを1つに絞る --------
  // 同じページが goltomo.com / app.goltomo.com のほかに
  //   golf-buddy-d2305.web.app / .firebaseapp.com / *.run.app
  // でも**一字一句同じ内容**で配信されている（Firebase と Cloud Run の既定ドメイン）。
  // canonical は goltomo.com を指しているが、それでも Google は重複として扱い、
  // 実際に Search Console で「重複しています。ユーザーにより、正規ページとして
  // 選択されていません」が出て、無関係な外部サイトが正規URLに選ばれていた。
  //
  // robots.txt は静的ファイルなのでホスト別に出し分けられない。だから
  // **正規のホスト以外には noindex ヘッダを付ける**。動作は何も変えない。
  const CANONICAL_HOSTS = new Set([
    'goltomo.com', 'www.goltomo.com', 'app.goltomo.com', 'admin.goltomo.com',
  ]);
  const isCanonicalHost = CANONICAL_HOSTS.has(host)
    || host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const noIndex = (res: NextResponse) => {
    if (!isCanonicalHost) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  };
  if (!isCanonicalHost) {
    // 既定ドメインで来たアクセスは正規のホストへ寄せる（人にも優しい）。
    // ただし次は寄せない：API と LIFF（cron や内部の呼び出しが run.app を
    // 使っている可能性があり、リダイレクトで壊すわけにいかない）、静的アセット、
    // そして vercel.app（旧環境。生きている経路を勝手に潰さない）。
    const isMachinePath = path.startsWith('/api/')
      || path === '/liff' || path.startsWith('/liff/')
      || path.startsWith('/_next/')
      || /\.[a-z0-9]{2,5}$/i.test(path);
    const isLegacy = host.endsWith('.vercel.app');
    if (!isMachinePath && !isLegacy) {
      return noIndex(NextResponse.redirect(new URL(`https://goltomo.com${path}${url.search}`), 308));
    }
    // 寄せないものは、そのまま通したうえで索引には入れさせない。
    return noIndex(NextResponse.next());
  }

  // -------- LP host (goltomo.com / www.goltomo.com) --------
  if (LP_HOSTS.has(host)) {
    // 末尾スラッシュを落としてから判定する。middleware は Next の正規化より
    // 先に走るので、ここで揃えないと /about/ が許可リストに当たらず404になる。
    if (path.length > 1 && path.endsWith('/')) {
      return NextResponse.redirect(new URL(`${path.replace(/\/+$/, '')}${url.search}`, req.url), 308);
    }
    // 静的アセット（画像・CSS・JS・フォント等）は public/ からそのまま配信。
    // これを通さないと LP(/lp や golmoti.html)が参照する画像が /lp の HTML に
    // 書き換えられてしまう（例: /line-logo.png）。
    if (/\.(png|jpe?g|webp|svg|gif|ico|css|js|mjs|map|woff2?|ttf|otf|json|txt|xml|mp4|webm)$/i.test(path)) {
      return NextResponse.next();
    }
    // goltomo.com/guide は記事の親URLに見えるが、実体はアプリの「使い方」タブ
    // (app/(main)/guide) のシェル。サイト共通の title のまま canonical も無い HTML を
    // 200 で返す＝ソフト404で、しかも最重要の指名KW「ゴルトモ」で自社ページ同士が
    // 競合する。記事一覧の実体は /guides なので、そこへ恒久リダイレクトする。
    // app.goltomo.com/guide（アプリ内の使い方タブ）はこの LP ホスト分岐を通らないので無影響。
    if (path === '/guide') {
      return NextResponse.redirect(new URL(`https://goltomo.com/guides${url.search}`), 308);
    }
    // /type と /type/[code] は SEO用の公開ページ（ゴルフ版MBTI 16タイプ）。
    // ここで通さないと、下の「それ以外は /lp に rewrite」に飲まれて LP が出てしまう。
    if (path.startsWith('/legal') || path === '/lp' || path.startsWith('/lp/') || path.startsWith('/icons/') || path.startsWith('/golmoti-chars/') || path === '/manifest.json' || path === '/favicon.ico' || path === '/golmoti' || path === '/golmoti.html' || path === '/golmoti-lp' || path === '/golmoti-lp.html' || path === '/type' || path.startsWith('/type/') || path === '/about' || path === '/data' || path.startsWith('/guide/') || path === '/guides') {
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
      path.startsWith('/add-friend') || path.startsWith('/qr') ||
      // /links はインスタのリンク集。貼っているのは app. 付きだが、裸のURLで
      // 来た人を404にしたくないので、正しいホストへ逃がす。
      path.startsWith('/links')
    ) {
      return NextResponse.redirect(new URL(`https://app.goltomo.com${path}${url.search}`));
    }
    // トップだけがLP。それ以外の知らないパスは**404にする**。
    //
    // これまでは知らないパスを全部 /lp へ rewrite していたので、
    // goltomo.com/no-such-page-xyz のようなでたらめなURLが200でLPを返していた
    // （＝ソフト404）。canonical で重複は吸収できていたが、Googleには
    // 「実在しないURLに200を返すサイト」として積み上がる。
    //
    // 404にする前に、意図して外に出しているURLは上で全部拾ってある
    //   … 静的ファイル / 許可リスト / /guide→/guides / /rounds / /mbti /
    //     /app（LIFF） / /admin系 / app ホスト行き（/links を含む）
    // 末尾スラッシュ付き（/about/ など）はここに来る前に正規化しておく。
    if (path !== '/') {
      return NextResponse.rewrite(new URL('/lp-404', req.url));
    }
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
      // 運営が立てる枠の管理は /admin/official から /api/official を叩く。
      // ここに入れないと middleware が 404（本文はJSONでない）を返し、
      // 画面側は JSON parse に失敗して意味の分からないエラーを出す。
      path === '/api/official' || path.startsWith('/api/official/') ||
      path.startsWith('/api/lp/') ||
      path.startsWith('/api/auth/') ||
      path === '/liff' || path.startsWith('/liff/') ||
      // 静的ファイルは拡張子でまとめて通す。ここを1つずつ列挙していたせいで、
      // 画像を1枚足すたびに管理画面だけ404になっていた（funnel-shots で再発）。
      /\.(png|jpe?g|webp|svg|gif|ico|css|js|mjs|map|woff2?|ttf|otf|json|txt|xml)$/i.test(path) ||
      path.startsWith('/icons/') || path === '/manifest.json'
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
