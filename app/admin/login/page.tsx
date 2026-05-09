'use client';

import { useState } from 'react';

// Admin login: simple password form. No LIFF / LINE involved — admin runs in
// a regular browser on admin.goltomo.com and LIFF redirect flows kept getting
// hijacked by Safari and losing the cookie. Password is checked server-side
// against the ADMIN_PASSWORD env var; success sets gb_admin_session cookie.
export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `ログインに失敗しました (${res.status})`);
        setSubmitting(false);
        return;
      }
      // Hard navigation so middleware + admin layout re-evaluate with the new cookie.
      window.location.replace('/admin');
    } catch (e) {
      setError((e as Error).message || 'ネットワークエラー');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-card rounded-card p-6 shadow-card">
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">⚙️</div>
          <div className="text-base font-black">ゴルトモ 管理画面</div>
          <div className="text-[11px] text-sub mt-1">パスワードを入力してください</div>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理パスワード"
          autoFocus
          className="w-full px-3 py-2 border-[1.5px] border-border rounded-lg text-sm mb-3"
        />
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-700 rounded-lg text-[11px]">{error}</div>
        )}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full py-2 bg-primary text-white rounded-lg text-sm font-bold disabled:opacity-50"
        >
          {submitting ? 'ログイン中...' : 'ログイン'}
        </button>
        <div className="mt-4 text-[10px] text-muted text-center">
          パスワードは Vercel 環境変数 ADMIN_PASSWORD に設定されたものです。
        </div>
      </form>
    </div>
  );
}
