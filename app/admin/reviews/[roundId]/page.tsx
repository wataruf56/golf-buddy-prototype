'use client';

import { confirmDialog, alertDialog } from '@/components/ConfirmDialog';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

type Verdict = 'again' | 'romantic' | 'never' | 'either';

type Review = {
  id: string;
  roundId: string;
  reviewerId: string;
  revieweeId: string;
  stars: number;
  verdict?: Verdict;
  tags?: string[];
  comment?: string;
  createdAt: number;
};

// 現仕様：星評価は廃止。レビューは4択判定(verdict)。表示・編集はこれに合わせる。
const VERDICT_META: Record<Verdict, { emoji: string; label: string; badge: string; sel: string }> = {
  again:    { emoji: '🏌️', label: 'また回りたい',       badge: 'bg-green-light text-green border-green',     sel: 'bg-green text-white border-green' },
  romantic: { emoji: '💘', label: '異性として気になる', badge: 'bg-pink-100 text-pink-600 border-pink-600',  sel: 'bg-pink-600 text-white border-pink-600' },
  either:   { emoji: '🤷', label: 'どっちでもいい',     badge: 'bg-bg text-sub border-border',               sel: 'bg-[#9b876a] text-white border-[#9b876a]' },
  never:    { emoji: '🙇', label: 'ごめんなさい',       badge: 'bg-red-50 text-red-600 border-red-300',      sel: 'bg-[#C0392B] text-white border-[#C0392B]' },
};
const VERDICT_ORDER: Verdict[] = ['again', 'romantic', 'either', 'never'];

export default function AdminRoundReviewsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const params = useParams<{ roundId: string }>();
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const roundId = params.roundId;

  const [token, setToken] = useState('');
  const [items, setItems] = useState<Review[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [round, setRound] = useState<any>(null);
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
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}&roundId=${encodeURIComponent(roundId)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      setItems(d.items || []);
      setUsers(d.users || {});
      // Fetch round summary too
      try {
        const r2 = await fetch(`/api/admin/rounds?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (r2.ok) {
          const d2 = await r2.json();
          setRound((d2.items || []).find((x: any) => x.id === roundId) || null);
        }
      } catch {}
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token && roundId) load(); }, [token, roundId]);

  async function delReview(id: string, revert: boolean) {
    const msg = revert
      ? 'このレビューを削除し、レビュワーに「未レビュー」状態として再依頼します。よろしいですか？'
      : 'このレビューを完全に削除します。よろしいですか？';
    if (!(await confirmDialog(msg))) return;
    try {
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, revert }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alertDialog(`失敗: ${(e as Error).message}`);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin/reviews?token=${token}`} className="text-blue text-sm font-bold">← レビュー一覧</Link>
        <div className="flex-1 text-center text-base font-black truncate">📝 ラウンド内</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      {round ? (
        <div className="bg-card rounded-xl p-3 shadow-card mb-3">
          <div className="text-sm font-bold mb-1">{round.title || '(タイトル無し)'}</div>
          <div className="text-[11px] text-sub">
            {[round.area, round.courseName, round.date || round.dateRange].filter(Boolean).join(' ・ ')}
          </div>
          {round.hostId && users[round.hostId] && (
            <div className="text-[11px] text-muted mt-0.5">
              主催: {users[round.hostId].avatar} {users[round.hostId].displayName}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-orange-light text-orange rounded-xl p-3 mb-3 text-[11px]">
          ⚠ ラウンド本体が削除されています（レビューだけ残っている状態）
        </div>
      )}

      <div className="text-[11px] text-muted text-center mb-3">{items.length} 件のレビュー</div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}
      {busy && <div className="text-center text-xs text-muted">読み込み中...</div>}

      <div className="flex flex-col gap-2 pb-10">
        {items.map((r) => {
          const reviewer = users[r.reviewerId] || { displayName: '匿名', avatar: '?' };
          const reviewee = users[r.revieweeId] || { displayName: '?', avatar: '?' };
          return (
            <div key={r.id} className="bg-card rounded-xl p-3 shadow-card">
              <div className="flex items-center justify-between mb-1 gap-2">
                {r.verdict && VERDICT_META[r.verdict] ? (
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${VERDICT_META[r.verdict].badge}`}>
                    {VERDICT_META[r.verdict].emoji} {VERDICT_META[r.verdict].label}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted">（判定なし）</span>
                )}
                <div className="text-[10px] text-muted whitespace-nowrap">{new Date(r.createdAt).toLocaleString('ja-JP')}</div>
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
  const [verdict, setVerdict] = useState<Verdict | ''>(review.verdict || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!verdict) { alertDialog('判定を選んでください'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, verdict }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      onSaved();
    } catch (e) {
      alertDialog(`失敗: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-4">
          <div className="text-base font-black mb-3">レビューを編集</div>

          <div className="text-xs font-bold mb-1">判定（また回りたいか）</div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {VERDICT_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => setVerdict(k)}
                className={`py-2 rounded-lg text-[11px] font-bold border-[1.5px] leading-tight ${verdict === k ? VERDICT_META[k].sel : 'bg-card border-border text-sub'}`}
              >{verdict === k ? '✓ ' : ''}{VERDICT_META[k].emoji} {VERDICT_META[k].label}</button>
            ))}
          </div>
          <div className="text-[11px] text-muted leading-relaxed">
            ※ 現在のレビューは「4択判定」のみです（旧仕様の星・タグ・コメントは廃止）。
          </div>
        </div>
        <div className="flex border-t border-border">
          <button onClick={onClose} className="flex-1 py-3 text-sm text-sub">キャンセル</button>
          <button onClick={save} disabled={busy} className="flex-1 py-3 text-sm font-bold text-white bg-green disabled:opacity-50">{busy ? '...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
