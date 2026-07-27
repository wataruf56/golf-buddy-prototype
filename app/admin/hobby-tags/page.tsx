'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Tag = { name: string; count: number };

export default function AdminHobbyTagsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  async function load(t = token) {
    if (!t) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/hobby-tags?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setTags(j.tags || []);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token); /* eslint-disable-next-line */ }, [token]);

  async function del(name: string) {
    if (!window.confirm(`趣味タグ「${name}」を削除しますか？\nサジェストから消え、付与済みのユーザーからも外れます。`)) return;
    setBusy(name); setMsg('');
    try {
      const r = await fetch(`/api/admin/hobby-tags?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', name }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`✅「${name}」を削除（${j.removedFromUsers}人から除去）`);
      await load();
    } catch (e) { setMsg('失敗: ' + (e as Error).message); }
    finally { setBusy(''); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const visible = tags.filter((t) => !q.trim() || t.name.includes(q.trim()));

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🎯 趣味タグの管理</div>
      <div className="text-[12px] text-muted mb-3">ユーザーが追加した趣味タグ（人気順）。不適切なものを削除できます。</div>

      <div className="flex gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 タグを検索" className="flex-1 px-3 py-2 border-[1.5px] border-border rounded-[10px] text-sm bg-card outline-none" />
        <button onClick={() => load()} className="px-3 py-2 bg-card border border-border rounded-lg text-xs font-bold">🔄</button>
      </div>
      {msg && <div className="text-[12px] font-bold text-center mb-2">{msg}</div>}

      {loading ? (
        <div className="text-center text-sm text-muted py-10">読み込み中...</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-sm text-muted py-10">タグはありません。</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((t) => (
            <div key={t.name} className="flex items-center gap-2 bg-card rounded-xl shadow-card px-3 py-2.5">
              <span className="text-[14px] font-bold flex-1 min-w-0 truncate">{t.name}</span>
              <span className="text-[11px] text-muted font-bold flex-shrink-0">{t.count}人</span>
              <button onClick={() => del(t.name)} disabled={!!busy} className="px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-300 rounded-lg text-xs font-bold flex-shrink-0 disabled:opacity-50">削除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
