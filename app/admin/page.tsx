'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function AdminTop() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<{ users: number; swingAllowed: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    setToken(stored);
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        setStats({ users: d.count, swingAllowed: d.allowedCount });
      } catch {}
    })();
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto">
        <div className="text-2xl font-black mb-3">⚙️ 管理画面</div>
        <div className="bg-card rounded-xl p-4 shadow-card">
          <div className="text-sm font-bold mb-2">管理トークンを入力</div>
          <input
            type="password"
            placeholder="ADMIN_LOG_TOKEN"
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v.length >= 20) {
                localStorage.setItem('gb_admin_token', v);
                setToken(v);
              }
            }}
            className="w-full p-3 border-[1.5px] border-border rounded-lg text-sm bg-bg outline-none"
          />
          <div className="text-[11px] text-muted mt-2">
            または URL に <code className="bg-bg px-1 rounded">?token=...</code> を付けてアクセスすると localStorage に自動保存されます
          </div>
        </div>
      </div>
    );
  }

  const items = [
    { href: `/admin/users?token=${token}`, emoji: '👥', title: 'ユーザー管理', desc: 'LINE登録ユーザー一覧 / Swing許可リスト編集' },
    { href: `/admin/rounds?token=${token}`, emoji: '🏆', title: 'ラウンド募集', desc: '全募集の一覧・削除' },
    { href: `/admin/reviews?token=${token}`, emoji: '📝', title: 'レビュー', desc: '編集・削除・差し戻し（再依頼）' },
    { href: `/admin/swing?token=${token}`, emoji: '🏌️', title: 'スイング解析モニタ', desc: '解析履歴・状態確認・スタック復旧' },
    { href: `/admin/system?token=${token}`, emoji: '🔧', title: 'システム状態', desc: '環境変数 / GCS / LINE Bot 接続確認' },
  ];

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="text-2xl font-black mb-1">⚙️ 管理画面</div>
      {stats && (
        <div className="text-[11px] text-muted mb-4">
          総ユーザー <b className="text-text">{stats.users}</b> / Swing許可 <b className="text-text">{stats.swingAllowed}</b>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-card"
          >
            <span className="text-2xl">{it.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-[11px] text-sub mt-0.5 truncate">{it.desc}</div>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
      </div>

      <button
        onClick={() => { localStorage.removeItem('gb_admin_token'); setToken(''); }}
        className="w-full mt-6 p-3 text-xs text-muted underline"
      >トークンを忘れる (ログアウト)</button>
    </div>
  );
}
