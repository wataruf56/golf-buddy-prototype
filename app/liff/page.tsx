'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// LIFF entry: initialize SDK → ensure logged in → exchange idToken for our cookie → redirect.
// Default redirect target is /home, override with ?to=/round/xxx etc.
//
// Auto-recovers from an expired LINE ID token by calling liff.logout() and
// re-running liff.login(). A `?retried=1` flag in the redirect URI prevents
// the recovery from looping if the second attempt also fails — we surface a
// clear error to the user instead of leaving them on a spinner forever.
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
  const retried = search?.get('retried') === '1';
  const [status, setStatus] = useState<string>('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です。Vercel の環境変数に LIFF ID を入れてください。');
      return;
    }

    // Build the URL we want LINE to send the user back to after liff.login().
    // We deliberately encode `to` and `retried=1` so they survive the OAuth
    // round-trip even when LIFF SDK rewrites the query into ?liff.state=.
    const buildRetryRedirect = () =>
      `${window.location.origin}/liff?retried=1&to=${encodeURIComponent(to)}`;

    let cancelled = false;
    (async () => {
      try {
        setStatus('LIFF SDK 読み込み中...');
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId });
        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          if (retried) {
            throw new Error('LINE ログインに失敗しました。LINE アプリを再起動してからもう一度お試しください。');
          }
          setStatus('LINE ログインへ転送...');
          liff.login({ redirectUri: buildRetryRedirect() });
          return;
        }

        setStatus('セッション発行中...');
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('idToken が取得できませんでした');

        // 公式LINEアカウントの友だち追加状況を取得（プロバイダーにOAが
        // 紐付いている場合のみ有効。取得できなければ undefined のまま送る）。
        let friendFlag: boolean | undefined = undefined;
        try {
          const fs = await liff.getFriendship();
          if (fs && typeof fs.friendFlag === 'boolean') friendFlag = fs.friendFlag;
        } catch { /* getFriendship 非対応環境では無視 */ }

        const res = await fetch('/api/auth/liff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, friendFlag }),
          cache: 'no-store',
          credentials: 'include',
        });

        if (!res.ok) {
          const text = await res.text();
          // Expired ID token: the SDK is handing back a stale cached token.
          // Log out + log in once to force a refresh; the URL flag above
          // stops us from doing this twice in a row.
          if (res.status === 401 && /expired/i.test(text)) {
            if (retried) {
              throw new Error('セッションが繰り返し期限切れになります。LINE アプリを再起動してからもう一度お試しください。');
            }
            setStatus('セッション更新中...');
            try { liff.logout(); } catch {}
            liff.login({ redirectUri: buildRetryRedirect() });
            return;
          }
          throw new Error(`auth failed: ${res.status} ${text.slice(0, 200)}`);
        }

        setStatus('完了。ホームへ移動します...');
        router.replace(to);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [router, to, retried]);

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
