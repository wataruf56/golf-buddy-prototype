'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Stats = {
  month: string;
  total?: { pushes: number; recipients: number };
  byKind?: Record<string, { pushes: number; recipients: number }>;
  daily?: Record<string, number>;
};

export default function AdminLineStatsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [months, setMonths] = useState<Array<{ month: string; recipients: number; pushes: number }>>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);

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

  async function load(t = token, m = month) {
    if (!t) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/line-stats?token=${encodeURIComponent(t)}${m ? `&month=${m}` : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setStats(j.stats); setMonths(j.months || []); setLabels(j.labels || {}); if (!month) setMonth(j.stats?.month || ''); }
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token, month); /* eslint-disable-next-line */ }, [token, month]);

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const total = stats?.total || { pushes: 0, recipients: 0 };
  const kinds = Object.entries(stats?.byKind || {}).sort((a, b) => (b[1]?.recipients || 0) - (a[1]?.recipients || 0));
  const maxKind = kinds.reduce((m, [, v]) => Math.max(m, v?.recipients || 0), 0) || 1;
  const days = Object.entries(stats?.daily || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const label = (k: string) => labels[k] || k;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">📨 LINE送信レポート</div>
      <div className="text-[12px] text-muted mb-3 leading-relaxed">
        全体に送っているLINEを種別ごとに集計。<b className="text-text">通数</b>が課金対象（延べ宛先数）の目安です。
      </div>

      {/* 月切り替え */}
      {months.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {months.map((m) => (
            <button key={m.month} onClick={() => setMonth(m.month)}
              className={'px-3 py-1.5 rounded-full text-xs font-bold border-[1.5px] ' + (month === m.month ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}>
              {m.month}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center text-sm text-muted py-10">読み込み中...</div>
      ) : (
        <>
          {/* 合計 */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <div className="text-[11px] text-muted">{stats?.month} の合計</div>
            <div className="text-[30px] font-black text-green leading-tight">{total.recipients.toLocaleString()}<span className="text-[14px] text-sub font-bold ml-1">通</span></div>
            <div className="text-[11px] text-muted">送信呼び出し {total.pushes.toLocaleString()} 回</div>
          </div>

          {/* 種別内訳 */}
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <div className="text-[13px] font-black mb-2.5">種別ごとの通数</div>
            {kinds.length === 0 ? (
              <div className="text-center text-sm text-muted py-6">まだ送信記録がありません。</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {kinds.map(([k, v]) => (
                  <div key={k}>
                    <div className="flex items-baseline justify-between mb-0.5">
                      <span className="text-[12px] font-bold truncate">{label(k)}</span>
                      <span className="text-[12px] font-black text-green flex-shrink-0 ml-2">{(v?.recipients || 0).toLocaleString()}通<span className="text-[10px] text-muted font-normal ml-1">/ {v?.pushes || 0}回</span></span>
                    </div>
                    <div className="h-2 bg-bg rounded overflow-hidden">
                      <div className="h-full bg-green rounded" style={{ width: `${Math.round(((v?.recipients || 0) / maxKind) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 日別 */}
          {days.length > 0 && (
            <div className="bg-card rounded-xl shadow-card p-4 mb-3">
              <div className="text-[13px] font-black mb-2">日別の通数</div>
              <div className="flex flex-col gap-1">
                {days.map(([d, n]) => (
                  <div key={d} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">{d.slice(5)}</span>
                    <span className="font-bold">{n.toLocaleString()}通</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 月別推移 */}
          {months.length > 1 && (
            <div className="bg-card rounded-xl shadow-card p-4">
              <div className="text-[13px] font-black mb-2">月別の合計通数</div>
              <div className="flex flex-col gap-1">
                {months.map((m) => (
                  <div key={m.month} className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">{m.month}</span>
                    <span className="font-bold">{m.recipients.toLocaleString()}通<span className="text-[10px] text-muted font-normal ml-1">/ {m.pushes}回</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
