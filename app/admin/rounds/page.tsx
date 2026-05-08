'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Round = {
  id: string;
  hostId: string;
  title: string;
  type: string;
  courseName?: string;
  area?: string;
  date?: string;
  dateRange?: string;
  startTime?: string;
  maxSpots: number;
  currentCount: number;
  applicantIds?: string[];
  pendingApplicantIds?: string[];
  price?: string;
  levelCondition?: string;
  status: string;
  isCompetition?: boolean;
  createdAt: number;
};

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-green-light text-green',
  closed: 'bg-bg text-sub',
  completed: 'bg-blue-light text-blue',
};

export default function AdminRoundsPage() {
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
  const [items, setItems] = useState<Round[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'completed'>('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    setToken(t);
  }, [tokenFromUrl]);

  async function load() {
    if (!token) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/admin/rounds?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setItems(d.items || []);
      setUsers(d.users || {});
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function delRound(id: string, cascade: boolean) {
    const msg = cascade
      ? 'このラウンドに紐づく全てを削除します:\n・ラウンド本体\n・参加者の投稿レビュー\n・レビュー依頼\n・グループチャット履歴\n\n本当に削除しますか？'
      : 'このラウンド本体だけを削除します（レビュー・チャット・依頼は残ります）。よろしいですか？';
    if (!confirm(msg)) return;
    try {
      const r = await fetch(`/api/admin/rounds?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, cascade }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setItems((prev) => prev.filter((x) => x.id !== id));
      if (d.pendingDeleted || d.reviewsDeleted || d.chatMsgsDeleted) {
        alert(`削除完了\nレビュー: ${d.reviewsDeleted ?? 0}件\nレビュー依頼: ${d.pendingDeleted}件\nチャット: ${d.chatMsgsDeleted}件`);
      }
    } catch (e) {
      alert(`失敗: ${(e as Error).message}`);
    }
  }

  const filtered = items.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!filter) return true;
    const f = filter.toLowerCase();
    const host = users[r.hostId];
    return (
      (r.title || '').toLowerCase().includes(f) ||
      (r.courseName || '').toLowerCase().includes(f) ||
      (r.area || '').toLowerCase().includes(f) ||
      (host?.displayName || '').toLowerCase().includes(f) ||
      r.id.toLowerCase().includes(f)
    );
  });

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">🏆 ラウンド募集</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      <div className="text-[11px] text-muted text-center mb-2">計 {items.length} 件 / 表示 {filtered.length}</div>

      <div className="flex gap-1 mb-2">
        {(['all', 'open', 'closed', 'completed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded ${statusFilter === s ? 'bg-green text-white' : 'bg-card text-sub border-[1.5px] border-border'}`}
          >
            {s === 'all' ? '全て' : s === 'open' ? '募集中' : s === 'closed' ? '締切' : '完了'}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="🔍 タイトル / コース / エリア / 主催者"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full p-2.5 mb-3 border-[1.5px] border-border rounded-lg text-sm bg-card outline-none"
      />

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}
      {busy && <div className="text-center text-xs text-muted">読み込み中...</div>}

      <div className="flex flex-col gap-2 pb-10">
        {filtered.map((r) => {
          const host = users[r.hostId] || { displayName: '?', avatar: '?' };
          return (
            <div key={r.id} className="bg-card rounded-xl p-3 shadow-card">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-bold truncate flex-1 min-w-0">{r.title || '(タイトル無し)'}</div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 ${STATUS_COLOR[r.status] || 'bg-bg text-sub'}`}>
                  {r.status === 'open' ? '募集中' : r.status === 'completed' ? '完了' : r.status}
                </span>
              </div>
              <div className="text-[11px] text-sub">
                {[r.area, r.courseName, r.date || r.dateRange, r.startTime].filter(Boolean).join(' ・ ')}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                主催: {host.avatar} {host.displayName} / {r.currentCount}/{r.maxSpots}人
                {r.isCompetition && ' / 🏆コンペ'}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                作成: {new Date(r.createdAt).toLocaleString('ja-JP')}
              </div>

              <div className="flex gap-1.5 mt-2">
                <Link
                  href={`/round/${r.id}`}
                  className="flex-1 py-1.5 text-[11px] font-bold bg-bg border-[1.5px] border-border rounded text-center"
                >アプリで開く</Link>
                <button
                  onClick={() => delRound(r.id, false)}
                  className="flex-1 py-1.5 text-[11px] font-bold bg-red-50 text-red-600 rounded"
                >ラウンドのみ削除</button>
                <button
                  onClick={() => delRound(r.id, true)}
                  className="flex-1 py-1.5 text-[11px] font-bold bg-red-100 text-red-700 rounded"
                >🗑 全部削除</button>
              </div>
              <details className="mt-1">
                <summary className="text-[9px] text-muted cursor-pointer">ID</summary>
                <div className="text-[9px] font-mono text-muted break-all mt-0.5">{r.id}</div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
