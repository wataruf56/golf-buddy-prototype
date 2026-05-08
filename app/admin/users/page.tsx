'use client';

import { Suspense, useEffect, useState } from 'react';
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
  const token = search?.get('token') || '';
  const [users, setUsers] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState<string>('');
  const [allowedCount, setAllowedCount] = useState(0);

  async function load() {
    if (!token) { setErr('?token=... を URL に付けてください'); return; }
    try {
      const r = await fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setUsers(d.users);
      setAllowedCount(d.allowedCount || 0);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { load(); }, [token]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  function copyAllAllowed() {
    if (!users) return;
    const ids = users.filter((u) => u.swingAllowed).map((u) => u.id).join(',');
    copy(ids, 'allowed-list');
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
    <div className="min-h-screen bg-bg p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-black">ユーザー管理</div>
          <div className="text-xs text-muted mt-0.5">
            総ユーザー: {users?.length ?? '...'} ／ Swingホワイトリスト: {allowedCount}人
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load()} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold">
            🔄 更新
          </button>
          <button onClick={copyAllAllowed} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold">
            {copied === 'allowed-list' ? '✓ コピー済' : '📋 許可済全IDコピー'}
          </button>
        </div>
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}

      <input
        type="search"
        placeholder="名前 / userId / エリアで絞り込み"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full p-2.5 mb-3 border-[1.5px] border-border rounded-lg text-sm bg-card outline-none"
      />

      <div className="text-[11px] text-sub mb-2">
        💡 userId をタップでコピー → Vercel の <code className="bg-bg px-1 rounded">SWING_ALLOWED_USER_IDS</code> に追加（カンマ区切り）→ Redeploy
      </div>

      <div className="flex flex-col gap-2">
        {filtered?.map((u) => (
          <div key={u.id} className={`bg-card rounded-xl p-3 shadow-card border-[1.5px] ${u.swingAllowed ? 'border-green' : 'border-transparent'}`}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-bg flex items-center justify-center text-lg flex-shrink-0">
                {u.avatarEmoji || '⛳'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-bold truncate">{u.displayName || '(no name)'}</div>
                  {u.swingAllowed && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-light text-green rounded">Swing許可</span>
                  )}
                </div>
                <div className="text-[11px] text-muted truncate">
                  {[
                    u.age ? `${u.age}歳` : null,
                    u.gender,
                    u.area,
                    u.scoreRange,
                    `R${u.roundCount}`,
                  ].filter(Boolean).join(' ・ ')}
                </div>
              </div>
            </div>
            <button
              onClick={() => copy(u.id, u.id)}
              className="w-full mt-2 px-2 py-1.5 bg-bg rounded-lg text-[10px] font-mono text-left break-all hover:bg-border"
            >
              {copied === u.id ? '✓ コピー済' : u.id}
            </button>
            {u.createdAt && (
              <div className="text-[10px] text-muted mt-1">
                登録: {new Date(u.createdAt).toLocaleDateString('ja-JP')}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered?.length === 0 && (
        <div className="text-center text-sm text-muted py-10">該当ユーザーなし</div>
      )}
    </div>
  );
}
