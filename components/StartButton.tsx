'use client';

import { useEffect, useState } from 'react';

// LP の「LINEで始める」CTA。着地URLの ?ref=（無ければ localStorage の記憶）を読み、
// /app?ref=◯◯ にして起動する。middleware が /app→LIFF URL へ ref を引き継ぎ、
// /liff で登録時に保存される（オリジンをまたぐ localStorage に依存しない）。
export function StartButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [href, setHref] = useState('/app');
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get('ref') || sp.get('utm_source') || sp.get('source')
        || (typeof localStorage !== 'undefined' ? localStorage.getItem('gb_ref') : '') || '';
      const ref = String(raw).toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
      setHref(ref ? `/app?ref=${encodeURIComponent(ref)}` : '/app');
    } catch { /* keep /app */ }
  }, []);
  return <a href={href} className={className}>{children}</a>;
}
