'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Review = {
  id: string;
  roundId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number;
  tags?: string[];
  comment?: string;
  createdAt: number;
};

export default function AdminReviewsPage() {
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
  const [items, setItems] = useState<Review[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<Review | null>(null);

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
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setItems(d.items || []);
      setUsers(d.users || {});
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function delReview(id: string, revert: boolean) {
    const msg = revert
      ? 'このレビューを削除し、レビュワーに「未レビュー」状態として再依頼します。よろしいですか？'
      : 'このレビューを完全に削除します。よろしいですか？';
    if (!confirm(msg)) return;
    try {
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revert }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert(`失敗: ${(e as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">📝 レビュー</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      <div className="text-[11px] text-muted text-center mb-3">計 {items.length} 件</div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}
      {busy && <div className="text-center text-xs text-muted">読み込み中...</div>}

      <div className="flex flex-col gap-2 pb-10">
        {items.map((r) => {
          const reviewer = users[r.reviewerId] || { displayName: '匿名', avatar: '?' };
          const reviewee = users[r.revieweeId] || { displayName: '?', avatar: '?' };
          return (
            <div key={r.id} className="bg-card rounded-xl p-3 shadow-card">
              <div className="flex items-center justify-between mb-1">
                <div className="text-yellow text-sm">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</div>
                <div className="text-[10px] text-muted">{new Date(r.createdAt).toLocaleString('ja-JP')}</div>
              </div>
              <div className="text-[11px] text-sub mb-1">
                {reviewer.avatar}<b className="ml-1">{reviewer.displayName}</b>
                <span className="mx-1.5">→</span>
                {reviewee.avatar}<b className="ml-1">{reviewee.displayName}</b>
              </div>
              {Array.isArray(r.tags) && r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {r.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-bg rounded-full">{t}</span>)}
                </div>
              )}
              {r.comment && (
                <div className="mt-2 p-2 bg-bg rounded text-[12px] whitespace-pre-wrap">{r.comment}</div>
              )}
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setEditing(r)} className="flex-1 py-1.5 text-[11px] font-bold bg-bg border-[1.5px] border-border rounded">編集</button>
                <button onClick={() => delReview(r.id, true)} className="flex-1 py-1.5 text-[11px] font-bold bg-orange-light text-orange rounded">差し戻し</button>
                <button onClick={() => delReview(r.id, false)} className="flex-1 py-1.5 text-[11px] font-bold bg-red-50 text-red-600 rounded">削除</button>
              </div>
              <details className="mt-1">
                <summary className="text-[9px] text-muted cursor-pointer">ID/Round</summary>
                <div className="text-[9px] font-mono text-muted break-all mt-0.5">
                  review:{r.id}<br />round:{r.roundId}
                </div>
              </details>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditModal
          token={token}
          review={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditModal({ token, review, onClose, onSaved }: { token: string; review: Review; onClose: () => void; onSaved: () => void }) {
  const [stars, setStars] = useState(review.stars);
  const [comment, setComment] = useState(review.comment || '');
  const [tags, setTags] = useState((review.tags || []).join(', '));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: review.id,
          stars,
          comment,
          tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      onSaved();
    } catch (e) {
      alert(`失敗: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4">
          <div className="text-base font-black mb-3">レビューを編集</div>

          <div className="text-xs font-bold mb-1">★評価</div>
          <div className="flex gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setStars(n)} className="text-2xl">{n <= stars ? '★' : '☆'}</button>
            ))}
          </div>

          <div className="text-xs font-bold mb-1">タグ（カンマ区切り）</div>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="w-full p-2 mb-3 border border-border rounded text-xs" />

          <div className="text-xs font-bold mb-1">コメント</div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="w-full h-24 p-2 border border-border rounded text-xs" />
        </div>
        <div className="flex border-t border-border">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-sub">キャンセル</button>
          <button onClick={save} disabled={busy} className="flex-1 py-3 text-sm font-bold text-white bg-green disabled:opacity-50">{busy ? '...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
