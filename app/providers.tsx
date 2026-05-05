'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { store } from '@/lib/store';
import { SwGuard } from '@/components/SwGuard';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function StoreHydrator({ children }: { children: ReactNode }) {
  const { status } = useSession();
  useEffect(() => {
    if (!(isDemo || status === 'authenticated')) return;
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
