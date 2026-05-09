'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// LIFF entry: initialize SDK → ensure logged in → exchange idToken for our cookie → redirect.
// Default redirect target is /home, override with ?to=/round/xxx etc.
//
// Restored to the exact pre-domain-migration shape — earlier additions
// (JWT pre-flight, localStorage purge, watchdog) introduced races that left
// the page stuck on "LIFFを起動中..." in the LINE webview.
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

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です。Vercel の環境変数に LIFF ID を入れてください。');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setStatus('LIFF SDK 読み込み中...');
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (cancelled) return;
        if (!liff.isLoggedIn()) {
          setStatus('LINE ログインへ転送...');
          // After login LINE redirects back to the LIFF endpoint with login state.
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
          throw new Error(`auth failed: ${res.status} ${text.slice(0, 200)}`);
        }
        setStatus('完了。ホームへ移動します...');
        router.replace(to);
      } catch (e) {
        setErrorMsg((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [router, to]);

  return <LiffLoading status={status} errorMsg={errorMsg} />;
}

function LiffLoading({ status, errorMsg }: { status: string; errorMsg?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⛳</div>
      <div className="text-base font-bold mb-2">ゴルトモ</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs max-w-sm break-words">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
