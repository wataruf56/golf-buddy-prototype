'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

// LIFF entry. Initialise SDK → ensure logged in → exchange idToken for our cookie → redirect.
// Default redirect target is /home, override with ?to=/round/xxx etc.
//
// Robustness:
//   • Each phase logs to console with [liff] prefix so issues are traceable
//   • A wall-clock timeout surfaces a visible error if anything stalls (instead
//     of leaving the user staring at a spinner forever)
//   • redirectUri for liff.login() uses the BARE LIFF endpoint URL (no query),
//     because LINE Login's redirect_uri allow-list checks an exact match
//     against the LIFF endpoint URL registered in the channel
export default function LiffEntryPage() {
  return (
    <Suspense fallback={<LiffLoading status="LIFFを起動中..." />}>
      <LiffEntryInner />
    </Suspense>
  );
}

function LiffEntryInner() {
  const search = useSearchParams();
  const to = search?.get('to') || '/home';
  const [status, setStatus] = useState<string>('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [diag, setDiag] = useState<string>('');
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    const log = (...args: any[]) => { try { console.log('[liff]', ...args); } catch {} };
    log('boot', { liffId, to, href: typeof window !== 'undefined' ? window.location.href : '' });

    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です。Vercel の環境変数に LIFF ID を入れてください。');
      return;
    }

    // Watchdog: if we're still here after 12s, surface diagnostics so the user
    // doesn't see an indefinite spinner.
    const watchdog = setTimeout(() => {
      setDiag((prev) => prev || `応答がありません (${Math.round((Date.now() - startedAt.current) / 1000)}s 経過)。\nURL: ${typeof window !== 'undefined' ? window.location.href : ''}\nUA: ${typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : ''}`);
    }, 12000);

    let cancelled = false;
    (async () => {
      try {
        setStatus('LIFF SDK 読み込み中...');
        log('importing @line/liff');
        const liff = (await import('@line/liff')).default;
        log('importing done, calling liff.init');

        setStatus('LIFF 初期化中...');
        await liff.init({ liffId });
        log('init ok', {
          isInClient: liff.isInClient?.(),
          isLoggedIn: liff.isLoggedIn?.(),
          os: liff.getOS?.(),
        });
        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          setStatus('LINE ログインへ転送...');
          // Use the bare LIFF endpoint URL as the redirect URI. The `to` query
          // is preserved across the LINE OAuth round-trip via sessionStorage
          // because some LIFF channels allow-list only the exact endpoint URL.
          try { sessionStorage.setItem('liff_to', to); } catch {}
          const origin = window.location.origin;
          const redirectUri = `${origin}/liff`;
          log('liff.login', { redirectUri });
          liff.login({ redirectUri });
          return;
        }

        // Recover any pending `to` from before login round-trip.
        let target = to;
        try {
          const saved = sessionStorage.getItem('liff_to');
          if (saved && (!search?.get('to'))) target = saved;
          sessionStorage.removeItem('liff_to');
        } catch {}

        setStatus('セッション発行中...');
        const idToken = liff.getIDToken();
        log('idToken present?', !!idToken);
        if (!idToken) throw new Error('idToken が取得できませんでした (LIFF channel に「openid」スコープが付与されていますか?)');

        const res = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          cache: 'no-store',
          credentials: 'include',
        });
        log('auth response', res.status);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`auth failed: ${res.status} ${text.slice(0, 300)}`);
        }

        clearTimeout(watchdog);
        setStatus('完了。移動します...');
        log('redirect ->', target);
        // Hard navigation so middleware on the new path runs cleanly.
        window.location.replace(target);
      } catch (e) {
        log('ERROR', e);
        const msg = (e as Error)?.message || String(e);
        setErrorMsg(msg);
      }
    })();
    return () => { cancelled = true; clearTimeout(watchdog); };
    // intentionally only depend on `to` (search is stable from useSearchParams)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  return <LiffLoading status={status} errorMsg={errorMsg} diag={diag} />;
}

function LiffLoading({ status, errorMsg, diag }: { status: string; errorMsg?: string; diag?: string }) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⛳</div>
      <div className="text-base font-bold mb-2">ゴルトモ</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs max-w-sm break-words text-left whitespace-pre-wrap">
          <div className="font-bold mb-1">エラー</div>
          {errorMsg}
        </div>
      )}
      {diag && !errorMsg && (
        <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-xs max-w-sm break-words text-left whitespace-pre-wrap">
          <div className="font-bold mb-1">読み込みが完了しません</div>
          {diag}
        </div>
      )}
      {(errorMsg || diag) && liffId && (
        <a
          href={`https://liff.line.me/${liffId}`}
          className="mt-4 inline-block px-4 py-2 bg-[#06C755] text-white rounded-lg text-xs font-bold"
        >
          LINEアプリで開き直す
        </a>
      )}
    </div>
  );
}
