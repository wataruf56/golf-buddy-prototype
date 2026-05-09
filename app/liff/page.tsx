'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// LIFF entry: initialize SDK → ensure logged in → exchange idToken for our cookie → redirect.
// Default redirect target is /home, override with ?to=/round/xxx etc.
//
// Behaviour matches the pre-domain-migration version (router.replace,
// redirectUri = window.location.href). Watchdog + on-screen error display are
// kept as passive safety nets; they only render if something has already gone
// wrong, so the happy path is unchanged.
export default function LiffEntryPage() {
  return (
    <Suspense fallback={<LiffLoading status="LIFFを起動中..." />}>
      <LiffEntryInner />
    </Suspense>
  );
}

function LiffEntryInner() {
  const router = useRouter();
  const search = useSearchParams();
  const to = search?.get('to') || '/home';
  const [status, setStatus] = useState<string>('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [diag, setDiag] = useState<string>('');
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    const log = (...args: any[]) => { try { console.log('[liff]', ...args); } catch {} };
    log('boot', { liffId, to });

    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です。Vercel の環境変数に LIFF ID を入れてください。');
      return;
    }

    const watchdog = setTimeout(() => {
      setDiag((prev) => prev || `応答がありません (${Math.round((Date.now() - startedAt.current) / 1000)}s)`);
    }, 12000);

    let cancelled = false;
    (async () => {
      try {
        setStatus('LIFF SDK 読み込み中...');
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        log('init ok', { isInClient: liff.isInClient?.(), isLoggedIn: liff.isLoggedIn?.() });
        if (cancelled) return;
        if (!liff.isLoggedIn()) {
          setStatus('LINE ログインへ転送...');
          // Match pre-domain version: redirect back to the exact current URL
          // (preserves the ?to=... query across the LINE login round-trip).
          liff.login({ redirectUri: window.location.href });
          return;
        }
        setStatus('セッション発行中...');
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('idToken が取得できませんでした');
        const res = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) {
          const text = await res.text();
          // LIFF caches the ID token client-side and it expires after ~1 hour.
          // If LINE rejects it as expired, log out and bounce back through
          // liff.login() so the SDK fetches a fresh token.
          if (res.status === 401 && /IdToken expired|expired/i.test(text)) {
            log('idToken expired, forcing re-login');
            setStatus('セッション期限切れ。再ログインします...');
            try { liff.logout(); } catch {}
            liff.login({ redirectUri: window.location.href });
            return;
          }
          throw new Error(`auth failed: ${res.status} ${text.slice(0, 200)}`);
        }
        clearTimeout(watchdog);
        setStatus('完了。ホームへ移動します...');
        router.replace(to);
      } catch (e) {
        log('ERROR', e);
        setErrorMsg((e as Error).message);
      }
    })();
    return () => { cancelled = true; clearTimeout(watchdog); };
  }, [router, to]);

  return <LiffLoading status={status} errorMsg={errorMsg} diag={diag} />;
}

function LiffLoading({ status, errorMsg, diag }: { status: string; errorMsg?: string; diag?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⛳</div>
      <div className="text-base font-bold mb-2">ゴルトモ</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs max-w-sm break-words text-left whitespace-pre-wrap">
          {errorMsg}
        </div>
      )}
      {diag && !errorMsg && (
        <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-xs max-w-sm break-words text-left whitespace-pre-wrap">
          {diag}
        </div>
      )}
    </div>
  );
}
