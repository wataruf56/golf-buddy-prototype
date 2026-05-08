'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type State = 'checking' | 'allowed' | 'denied' | 'unauthorized';

export function SwingAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/swing/access', { cache: 'no-store' });
        if (cancelled) return;
        if (r.status === 401) { setState('unauthorized'); return; }
        const d = await r.json();
        setState(d.allowed ? 'allowed' : 'denied');
      } catch {
        if (!cancelled) setState('denied');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'checking') {
    return (
      <div className="px-5 py-10 text-center">
        <div className="text-3xl mb-3 animate-pulse">⛳</div>
        <div className="text-sm text-muted">読み込み中...</div>
      </div>
    );
  }

  if (state === 'allowed') return <>{children}</>;

  // unauthorized = LIFF cookie切れ等。LIFFエントリに飛ばすのが正解だが、
  // テスト中は同じメッセージで丸める。
  return (
    <div className="px-5 py-3">
      <div className="text-2xl font-black tracking-tight pt-2 pb-3">スイング分析</div>
      <div className="bg-card rounded-card p-8 text-center shadow-card">
        <div className="text-4xl mb-3">🚧</div>
        <div className="text-base font-black mb-2">開発準備中です</div>
        <div className="text-[12px] text-sub leading-relaxed mb-5">
          スイング分析機能は現在クローズドβ中です。<br />
          一般公開までしばらくお待ちください。
        </div>
        <Link
          href="/home"
          className="inline-block px-4 py-2 bg-green text-white rounded-full text-xs font-bold"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
