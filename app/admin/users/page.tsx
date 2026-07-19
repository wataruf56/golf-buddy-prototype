'use client';

import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';

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
  restriction?: {
    noCreate?: boolean; noApplyAll?: boolean; noInvite?: boolean;
    noChat?: boolean; noDM?: boolean; noInterest?: boolean; noReview?: boolean;
    applyBlockHostIds?: string[];
  };
};

// 部分制限のチェックボックス定義（表示順・ラベル）。
const RESTRICTION_ITEMS: { key: 'noCreate' | 'noApplyAll' | 'noInvite' | 'noChat' | 'noDM' | 'noInterest' | 'noReview'; label: string }[] = [
  { key: 'noCreate', label: 'ラウンド募集を禁止' },
  { key: 'noApplyAll', label: '参加申込を全面禁止（全ラウンド）' },
  { key: 'noInvite', label: 'ゴルトモ招待を禁止' },
  { key: 'noChat', label: 'グループチャット投稿を禁止' },
  { key: 'noDM', label: 'ダイレクトメッセージを禁止' },
  { key: 'noInterest', label: '「気になる」を禁止' },
  { key: 'noReview', label: 'レビュー投稿を禁止' },
];

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
      const [r, banRes, rstRes] = await Promise.all([
        fetch(`/api/admin/users?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
        fetch(`/api/admin/ban?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
        fetch(`/api/admin/restrict?token=${encodeURIComponent(token)}`, { cache: 'no-store' }),
      ]);
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      const bannedIds: string[] = banRes.ok ? ((await banRes.json()).ids || []) : [];
      const rstMap: Record<string, any> = rstRes.ok ? ((await rstRes.json()).map || {}) : {};
      const bset = new Set(bannedIds);
      setUsers((d.users || []).map((u: Row) => ({ ...u, banned: bset.has(u.id), restriction: rstMap[u.id] || {} })));
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
      alertDialog(`失敗: ${(e as Error).message}`);
    } finally {
      setBusyId('');
    }
  }

  async function toggleBan(u: Row) {
    if (!token) return;
    const next = !u.banned;
    if (next && !(await confirmDialog(`${u.displayName || 'このユーザー'} を「赤バン」しますか？\nログイン不可・他ユーザーから完全非表示・招待候補からも除外され、一切利用できなくなります。`))) return;
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
      alertDialog(`失敗: ${(e as Error).message}`);
    } finally {
      setBusyId('');
    }
  }

  // 部分制限のローカル編集（保存ボタンで永続化）。
  function editRestriction(id: string, patch: Partial<NonNullable<Row['restriction']>>) {
    setUsers((prev) => prev?.map((x) => x.id === id ? { ...x, restriction: { ...(x.restriction || {}), ...patch } } : x) || null);
  }
  async function saveRestriction(u: Row) {
    if (!token) return;
    setBusyId(u.id);
    try {
      const r = await fetch(`/api/admin/restrict?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: u.id,
          noCreate: !!u.restriction?.noCreate,
          noApplyAll: !!u.restriction?.noApplyAll,
          noInvite: !!u.restriction?.noInvite,
          noChat: !!u.restriction?.noChat,
          noDM: !!u.restriction?.noDM,
          noInterest: !!u.restriction?.noInterest,
          noReview: !!u.restriction?.noReview,
          applyBlockHostIds: u.restriction?.applyBlockHostIds || [],
        }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setUsers((prev) => prev?.map((x) => x.id === u.id ? { ...x, restriction: d.restriction || {} } : x) || null);
      alertDialog('部分制限を保存しました');
    } catch (e) {
      alertDialog(`失敗: ${(e as Error).message}`);
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
              {busyId === u.id ? '...' : u.banned ? '🚫 赤バン中（タップで解除）' : '🚫 赤バン（ログイン不可・完全非表示）'}
            </button>

            {/* 部分制限（通報対応で機能を一部だけ止める） */}
            <details className="mt-2 bg-bg rounded-lg border-[1.5px] border-border">
              <summary className="px-3 py-2 text-[11px] font-bold text-sub cursor-pointer list-none flex items-center justify-between">
                <span>⚙️ 部分制限（通報対応）</span>
                {((RESTRICTION_ITEMS.some((it) => (u.restriction as any)?.[it.key]) || (u.restriction?.applyBlockHostIds || []).length > 0)) && (
                  <span className="text-[9px] font-black text-white bg-orange rounded-full px-2 py-[1px]">制限中</span>
                )}
              </summary>
              <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
                {RESTRICTION_ITEMS.map((it) => (
                  <label key={it.key} className="flex items-center gap-2 text-[12px] font-bold">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-orange"
                      checked={!!(u.restriction as any)?.[it.key]}
                      onChange={(e) => editRestriction(u.id, { [it.key]: e.target.checked } as any)}
                    />
                    {it.label}
                  </label>
                ))}
                <div>
                  <div className="text-[11px] font-bold mb-1">参加申込を禁止する主催者ID（1行1ID）</div>
                  <textarea
                    value={(u.restriction?.applyBlockHostIds || []).join('\n')}
                    onChange={(e) => editRestriction(u.id, { applyBlockHostIds: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                    rows={3}
                    placeholder="Uxxxxxxxx...（このユーザーが申込できない主催者）"
                    className="w-full p-2 border-[1.5px] border-border rounded text-[11px] font-mono bg-card outline-none resize-y"
                  />
                </div>
                <button
                  onClick={() => saveRestriction(u)}
                  disabled={busyId === u.id}
                  className="w-full py-2 bg-orange text-white rounded-lg text-xs font-bold disabled:opacity-50"
                >{busyId === u.id ? '...' : '部分制限を保存'}</button>
              </div>
            </details>

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
