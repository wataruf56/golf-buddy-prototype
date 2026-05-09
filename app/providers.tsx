'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { store } from '@/lib/store';
import { SwGuard } from '@/components/SwGuard';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function StoreHydrator({ children }: { children: ReactNode }) {
  const { status } = useSession();
  useEffect(() => {
    // Always trigger hydrate — middleware has already gated this route, so
    // any user that reached a (main) page is authenticated either via
    // NextAuth or the LIFF session cookie. Previously this only fired for
    // NextAuth, so LIFF-only users (whose gb_liff_session cookie is httpOnly
    // and invisible to JS) never triggered the bootstrap fetch and the
    // (main) layout stayed on its hydration spinner forever. /api/bootstrap
    // itself enforces auth and returns 401 if neither session is present;
    // the catch in store.hydrate() flips `hydrated` to true on error so we
    // never deadlock the UI.
    if (!isDemo && status === 'loading') return;
    import('@/lib/telemetry').then(({ track }) => track('app_open', {
      ua: navigator.userAgent.slice(0, 120),
      standalone: (window.matchMedia?.('(display-mode: standalone)').matches) || false,
    }));
    store.hydrate();
  }, [status]);
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
