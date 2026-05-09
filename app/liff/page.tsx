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

// Decode a JWT's payload without verifying. Returns null on any failure.
// Used only to check the `exp` claim client-side so we don't ship a token
// LINE will reject as expired.
function decodeJwt(token: string): any {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    // base64url -> base64
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(part.length + (4 - part.length % 4) % 4, '=');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}

function isTokenStale(token: string | null | undefined): boolean {
  if (!token) return true;
  const p = decodeJwt(token);
  if (!p || typeof p.exp !== 'number') return false; // can't tell — let server decide
  // 60s safety buffer so we don't ship one that expires mid-flight.
  return p.exp * 1000 < Date.now() + 60_000;
}

// Belt-and-braces local-storage cleanup. liff.logout() doesn't always purge
// every cached entry on every browser, and a stale entry leads liff.getIDToken()
// to keep returning the same expired token.
function nukeLiffStorage() {
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('LIFF') || k.startsWith('liff'))) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch {}
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
        const payload = idToken ? decodeJwt(idToken) : null;
        log('idToken claims', { exp: payload?.exp, now: Math.floor(Date.now() / 1000), staleBy: payload?.exp ? Math.floor(Date.now() / 1000) - payload.exp : null });

        // Pre-flight: if the cached idToken is missing or already expired,
        // don't bother POSTing it — go straight to a forced refresh. This
        // avoids the round-trip that LINE will reject anyway.
        if (!idToken || isTokenStale(idToken)) {
          log('idToken missing/stale before send → forcing fresh login');
          setStatus('セッション更新中...');
          try { liff.logout(); } catch {}
          nukeLiffStorage();
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const res = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) {
          const text = await res.text();
          // Server-side fallback: if LINE rejects the token as expired even
          // though our pre-flight check passed (clock skew, race, etc.),
          // nuke local cache and bounce through login one more time.
          if (res.status === 401 && /IdToken expired|expired/i.test(text)) {
            log('server reported expired idToken → forcing fresh login');
            setStatus('セッション期限切れ。再ログインします...');
            try { liff.logout(); } catch {}
            nukeLiffStorage();
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
