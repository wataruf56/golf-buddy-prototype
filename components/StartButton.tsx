'use client';

import { useEffect, useState } from 'react';

// LP の「LINEで始める」CTA。着地URLの ?ref=（無ければ localStorage の記憶）を読み、
// /app?ref=◯◯ にして起動する。middleware が /app→LIFF URL へ ref を引き継ぎ、
// /liff で登録時に保存される（オリジンをまたぐ localStorage に依存しない）。
// lp="cta_hero" のように名前を渡すと、LP計測（lib/lpTrackScript）が
// どのボタンから LINE公式へ進んだかを記録する。このボタンは全て最終ゴール扱い。
export function StartButton({ className, children, lp }: { className?: string; children: React.ReactNode; lp?: string }) {
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
  return <a href={href} className={className} data-lp={lp || 'cta_line'} data-lp-goal="1">{children}</a>;
}
