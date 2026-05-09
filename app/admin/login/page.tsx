'use client';

import { useEffect, useState } from 'react';

// Admin login bridge.
// LIFF endpoint URL is registered as https://app.goltomo.com/liff (single subdomain),
// so we can't run liff.login() directly on admin.goltomo.com — LINE would reject the
// redirect URI. Instead, bounce the user through app.goltomo.com/liff?to=/admin where
// the LIFF cookie gets set with `domain=.goltomo.com` (parent-scope, see api/auth/liff).
// After login, /liff redirects to /admin which middleware sends back to admin.goltomo.com,
// where the cookie is now visible and the admin layout admits the user.
export default function AdminLoginPage() {
  const [status, setStatus] = useState('LINE ログインへ転送します...');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // If we're already on app.goltomo.com (e.g. someone clicked /admin/login there),
    // send them through the standard LIFF login flow with /admin as the destination.
    const host = window.location.hostname;
    const target = host === 'app.goltomo.com' ? '/liff?to=/admin' : 'https://app.goltomo.com/liff?to=/admin';
    setStatus('LIFF経由でログイン中...');
    // Small delay so the user sees the message
    setTimeout(() => { window.location.replace(target); }, 200);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg">
      <div className="text-4xl mb-4 animate-pulse">⚙️</div>
      <div className="text-base font-bold mb-2">ゴルトモ 管理画面</div>
      <div className="text-sm text-sub mb-2">{status}</div>
      <div className="mt-6 text-[10px] text-muted max-w-sm">
        LINE ログイン後、許可された LINE アカウントのみ管理画面にアクセスできます。
      </div>
    </div>
  );
}
