'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Row = {
  id: string;
  displayName: string;
  age: number | null;
  gender: string | null;
  car: string | null;
  area: string | null;
  scoreRange: string | null;
  avatarEmoji: string | null;
  lineId: string | null;
  roundCount: number;
  reviewCount: number;
  createdAt: number | null;
  swingAllowed: boolean;
  banned?: boolean;
};

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading...</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [users, setUsers] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string>('');
  const [allowedCount, setAllowedCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    setToken(t);
  }, [tokenFromUrl]);

  async function load() {
    if (!token) { setErr('ADMIN_LOG_TOKEN を ?token= か /admin で設定してください'); return; }
    try {
      const [r, banRes] = await Promise.all([
        fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
        fetch(`/api/admin/ban?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
      ]);
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      const bannedIds: string[] = banRes.ok ? ((await banRes.json()).ids || []) : [];
      const bset = new Set(bannedIds);
      setUsers((d.users || []).map((u: Row) => ({ ...u, banned: bset.has(u.id) })));
      setAllowedCount(d.allowedCount || 0);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function toggle(u: Row) {
    if (!token) return;
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/admin/swing-allow?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, allowed: !u.swingAllowed }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      // Optimistic update
      setUsers((prev) => prev?.map((x) => x.id === u.id ? { ...x, swingAllowed: !x.swingAllowed } : x) || null);
      setAllowedCount((c) => c + (u.swingAllowed ? -1 : 1));
    } catch (e) {
      alert(`失敗: ${(e as Error).message}`);
    } finally {
      setBusyId('');
    }
  }

  async function toggleBan(u: Row) {
    if (!token) return;
    const next = !u.banned;
    if (next && !confirm(`${u.displayName || 'このユーザー'} を「赤バン」しますか？\n募集・参加・チャット・気になる・招待・DM・レビューが利用できなくなります。`)) return;
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/admin/ban?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, banned: next }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setUsers((prev) => prev?.map((x) => x.id === u.id ? { ...x, banned: next } : x) || null);
    } catch (e) {
      alert(`失敗: ${(e as Error).message}`);
    } finally {
      setBusyId('');
    }
  }

  const filtered = users?.filter((u) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(f) ||
      (u.id || '').toLowerCase().includes(f) ||
      (u.area || '').toLowerCase().includes(f)
    );
  });

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">👥 ユーザー</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      <div className="text-[11px] text-muted text-center mb-3">
        計 {users?.length ?? '...'} 人 / Swing許可 {allowedCount} 人
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}

      <input
        type="search"
        placeholder="🔍 名前 / userId / エリア"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full p-3 mb-3 border-[1.5px] border-border rounded-lg text-sm bg-card outline-none"
      />

      <div className="flex flex-col gap-2 pb-10">
        {filtered?.map((u) => (
          <div
            key={u.id}
            className={`bg-card rounded-xl p-3 shadow-card border-[1.5px] ${u.banned ? 'border-red-500' : u.swingAllowed ? 'border-green' : 'border-transparent'}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-bg flex items-center justify-center text-xl flex-shrink-0">
                {u.avatarEmoji || '⛳'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{u.displayName || '(no name)'}</div>
                <div className="text-[11px] text-muted truncate">
                  {[
                    u.age ? `${u.age}歳` : null,
                    u.gender,
                    u.area,
                    u.scoreRange,
                  ].filter(Boolean).join(' ・ ') || '未入力'}
                </div>
              </div>
            </div>

            <button
              onClick={() => toggle(u)}
              disabled={busyId === u.id}
              className={`w-full py-2.5 rounded-lg text-xs font-bold transition ${
                u.swingAllowed
                  ? 'bg-green text-white'
                  : 'bg-bg text-text border-[1.5px] border-border'
              } ${busyId === u.id ? 'opacity-50' : ''}`}
            >
              {busyId === u.id ? '...' : u.swingAllowed ? '✓ Swing解析を許可中（タップで取消）' : '🏌️ Swing解析を許可する'}
            </button>

            <button
              onClick={() => toggleBan(u)}
              disabled={busyId === u.id}
              className={`w-full mt-1.5 py-2.5 rounded-lg text-xs font-bold transition ${
                u.banned
                  ? 'bg-red-500 text-white'
                  : 'bg-bg text-red-600 border-[1.5px] border-red-200'
              } ${busyId === u.id ? 'opacity-50' : ''}`}
            >
              {busyId === u.id ? '...' : u.banned ? '🚫 赤バン中（タップで解除）' : '🚫 赤バンする（コミュニティ利用停止）'}
            </button>

            <details className="mt-2">
              <summary className="text-[10px] text-muted cursor-pointer">userId / 詳細</summary>
              <div className="mt-1 p-2 bg-bg rounded text-[10px] font-mono break-all">{u.id}</div>
              <div className="text-[10px] text-muted mt-1">
                R:{u.roundCount} / レビュー:{u.reviewCount}
                {u.createdAt && ` / 登録:${new Date(u.createdAt).toLocaleDateString('ja-JP')}`}
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
