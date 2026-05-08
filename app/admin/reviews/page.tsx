'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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

type Group = {
  roundId: string;
  count: number;
  latestAt: number;
  avgStars: number;
  reviews: Review[];
};

type RoundInfo = {
  id: string;
  title?: string;
  hostId?: string;
  date?: string;
  dateRange?: string;
  area?: string;
  courseName?: string;
  status?: string;
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
  const [reviews, setReviews] = useState<Review[]>([]);
  const [users, setUsers] = useState<Record<string, any>>({});
  const [rounds, setRounds] = useState<Record<string, RoundInfo>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      // 1) Fetch all reviews
      const r1 = await fetch(`/api/admin/reviews?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (!r1.ok) throw new Error(`reviews ${r1.status}`);
      const d1 = await r1.json();
      setReviews(d1.items || []);
      setUsers(d1.users || {});

      // 2) Fetch all rounds (to get titles/areas for grouping cards)
      const r2 = await fetch(`/api/admin/rounds?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (r2.ok) {
        const d2 = await r2.json();
        const map: Record<string, RoundInfo> = {};
        (d2.items || []).forEach((rr: RoundInfo) => { map[rr.id] = rr; });
        setRounds(map);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (token) load(); }, [token]);

  const groups: Group[] = useMemo(() => {
    const m = new Map<string, Review[]>();
    for (const r of reviews) {
      if (!m.has(r.roundId)) m.set(r.roundId, []);
      m.get(r.roundId)!.push(r);
    }
    const out: Group[] = [];
    m.forEach((rs, roundId) => {
      const latestAt = Math.max(...rs.map((r) => r.createdAt));
      const avg = rs.reduce((s, r) => s + r.stars, 0) / rs.length;
      out.push({ roundId, count: rs.length, latestAt, avgStars: Math.round(avg * 10) / 10, reviews: rs });
    });
    out.sort((a, b) => b.latestAt - a.latestAt);
    return out;
  }, [reviews]);

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">📝 レビュー</div>
        <button onClick={load} className="text-blue text-sm font-bold">🔄</button>
      </div>

      <div className="text-[11px] text-muted text-center mb-3">
        計 {reviews.length} 件 ／ {groups.length} ラウンド
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}
      {busy && <div className="text-center text-xs text-muted">読み込み中...</div>}

      <div className="text-[11px] text-muted mb-2 px-1">
        💡 ラウンドをタップ → そのラウンドのレビューを編集/差し戻し/削除
      </div>

      <div className="flex flex-col gap-2 pb-10">
        {groups.map((g) => {
          const round = rounds[g.roundId];
          const host = round?.hostId ? users[round.hostId] : null;
          return (
            <Link
              key={g.roundId}
              href={`/admin/reviews/${g.roundId}?token=${token}`}
              className="block bg-card rounded-xl p-3 shadow-card"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="text-sm font-bold flex-1 min-w-0">
                  {round?.title || `(ラウンド削除済 / ${g.roundId.slice(0, 8)}...)`}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-bg rounded-full whitespace-nowrap">
                  {g.count}件
                </span>
              </div>
              {round && (
                <div className="text-[11px] text-sub">
                  {[round.area, round.courseName, round.date || round.dateRange].filter(Boolean).join(' ・ ')}
                </div>
              )}
              {host && (
                <div className="text-[11px] text-muted mt-0.5">
                  主催: {host.avatar} {host.displayName}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <div className="text-yellow text-[12px]">
                  {'★'.repeat(Math.round(g.avgStars))}{'☆'.repeat(5 - Math.round(g.avgStars))}
                  <span className="text-muted ml-1.5 text-[10px]">平均{g.avgStars}</span>
                </div>
                <div className="text-[10px] text-muted">
                  最新 {new Date(g.latestAt).toLocaleDateString('ja-JP')}
                </div>
              </div>
              {!round && (
                <div className="mt-1.5 text-[10px] text-orange">⚠ ラウンド本体が存在しません</div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
