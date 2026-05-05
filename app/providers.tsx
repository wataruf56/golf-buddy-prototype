'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { store } from '@/lib/store';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

function StoreHydrator({ children }: { children: ReactNode }) {
  const { status } = useSession();
  useEffect(() => {
    if (!(isDemo || status === 'authenticated')) return;
    store.hydrate();
  }, [status]);
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <StoreHydrator>{children}</StoreHydrator>
    </SessionProvider>
  );
}
