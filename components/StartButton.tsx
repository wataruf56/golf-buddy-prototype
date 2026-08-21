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
      // LPのvisitorIdをURLで運ぶ。localStorage は goltomo.com → app.goltomo.com の
      // オリジンをまたげないので、これが無いと「LPで押した人」と「LIFFまで来た人」が
      // 別人として記録され、どこで落ちたかを人単位で追えない。
      let vid = '';
      try { vid = localStorage.getItem('gb_vid') || ''; } catch { /* noop */ }
      // どのLPから飛んだかも運ぶ（トップLP / 診断LP のどちらで離脱したかを分けるため）。
      const lp = String((window as any).__lpPage || 'top').slice(0, 20);
      const qs = new URLSearchParams();
      if (ref) qs.set('ref', ref);
      if (vid) qs.set('v', vid);
      if (lp) qs.set('lp', lp);
      const q = qs.toString();
      setHref(q ? `/app?${q}` : '/app');
    } catch { /* keep /app */ }
  }, []);
  return <a href={href} className={className} data-lp={lp || 'cta_line'} data-lp-goal="1">{children}</a>;
}
