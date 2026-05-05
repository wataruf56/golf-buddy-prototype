import { withAuth } from 'next-auth/middleware';

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default isDemoMode
  ? function middleware() { return undefined as any; }
  : withAuth({
      pages: { signIn: '/login' },
    });

export const config = {
  matcher: [
    '/home/:path*',
    '/search/:path*',
    '/create/:path*',
    '/buddies/:path*',
    '/mypage/:path*',
    '/round/:path*',
    '/profile/:path*',
    '/chat/:path*',
  ],
};
