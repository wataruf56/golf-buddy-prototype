'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// 「友達の確認」への入口。マイページとゴル友リストの2か所に出す。
// やり残し（届いた申請／QRの未回答／評価まち）が無いときは何も出さない。
type Counts = { incoming: number; qr: number; outgoing: number; reviews: number };

export function FriendTodoBanner({ variant }: { variant: 'row' | 'banner' }) {
  const [c, setC] = useState<Counts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/friends/requests', { cache: 'no-store', credentials: 'include' });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setC(j?.counts || null);
      } catch { /* 出せなくても本体の表示は妨げない */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const todo = c ? c.incoming + c.qr + c.reviews : 0;
  if (!c || todo === 0) return null;

  const detail = [
    c.incoming ? `申請${c.incoming}件` : '',
    c.qr ? `QR${c.qr}件` : '',
    c.reviews ? `評価${c.reviews}件` : '',
  ].filter(Boolean).join('・');

  if (variant === 'banner') {
    return (
      <Link href="/friends/confirm" className="flex items-center gap-2.5 bg-orange-light border-2 border-orange rounded-card p-3 mb-3">
        <span className="text-lg">📨</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-black">確認まちが{todo}件</div>
          <div className="text-[11px] font-bold text-sub">{detail}</div>
        </div>
        <span className="text-muted font-black">›</span>
      </Link>
    );
  }

  return (
    <Link href="/friends/confirm" className="flex items-center gap-2.5 bg-orange-light border-2 border-orange rounded-card p-3.5 mb-4">
      <span className="text-xl">📨</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-black">友達の確認</div>
        <div className="text-[11.5px] font-bold text-sub">{detail}</div>
      </div>
      <span className="inline-block bg-orange text-white text-[11px] font-black rounded-full border-2 border-border px-2 py-0.5">{todo}</span>
      <span className="text-muted font-black">›</span>
    </Link>
  );
}
