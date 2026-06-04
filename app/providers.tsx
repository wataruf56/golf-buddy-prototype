'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { store } from '@/lib/store';
import { SwGuard } from '@/components/SwGuard';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Pages where bootstrapping the app store is pointless and harmful: the LIFF
// login/transition page (which immediately router.replace()s away — aborting
// any in-flight bootstrap fetch and logging a spurious "Load failed"
// hydrate_error), the marketing LP, and auth/legal/admin. Hydrating only on
// real app pages removes those transition-abort errors.
const NO_HYDRATE_PREFIXES = ['/liff', '/login', '/lp', '/legal', '/admin', '/share'];

function StoreHydrator({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname() || '';
  const skipHydrate =
    pathname === '/' || NO_HYDRATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
  useEffect(() => {
    // Only the (main) app pages need the store. middleware has already gated
    // those routes; users reach them authed via NextAuth or the LIFF session
    // cookie. /api/bootstrap enforces auth (401 if neither); store.hydrate()
    // flips `hydrated` true on error so we never deadlock the UI.
    if (skipHydrate) return;
    if (!isDemo && status === 'loading') return;
    import('@/lib/telemetry').then(({ track }) => track('app_open', {
      ua: navigator.userAgent.slice(0, 120),
      standalone: (window.matchMedia?.('(display-mode: standalone)').matches) || false,
    }));
    store.hydrate();
  }, [status, skipHydrate]);
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SwGuard />
      <StoreHydrator>{children}</StoreHydrator>
    </SessionProvider>
  );
}
