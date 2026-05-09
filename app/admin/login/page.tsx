'use client';

import { useEffect, useState } from 'react';

// LIFF bridge for the admin login.
// Same flow as /liff but redirects to /admin afterwards.
export default function AdminLoginPage() {
  const [status, setStatus] = useState('LIFFを起動中...');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '';
    if (!liffId) {
      setErrorMsg('NEXT_PUBLIC_LIFF_ID が未設定です');
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
          const t = await res.text();
          throw new Error(`auth failed: ${res.status} ${t.slice(0, 200)}`);
        }
        setStatus('完了。管理画面へ移動します...');
        // Hard redirect so the cookie is read by the server-side admin layout.
        window.location.replace('/admin');
      } catch (e) {
        setErrorMsg((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⚙️</div>
      <div className="text-base font-bold mb-2">ゴルトモ 管理画面</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      {errorMsg && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-xs max-w-sm break-words">
          {errorMsg}
        </div>
      )}
      <div className="mt-6 text-[10px] text-muted max-w-sm">
        LINEログイン後、許可されたアカウントのみ管理画面にアクセスできます。
      </div>
    </div>
  );
}
