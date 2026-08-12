'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

// 管理画面：全員の評価状況を一覧し、一人ずつ詳しく見る。
// ★はアプリと同じ「また回りたい率」の定義（レビューをくれた人のうち、ごめんなさいが何人か）。

type Rev = { from: string; fromName: string; verdict: string; comment: string; ts: number };
type Row = {
  id: string; name: string; avatarUrl: string; isTest: boolean;
  star: number | null; roundedWith: number; againCount: number; neverCount: number; againRate: number;
  hosted: number; joined: number; noShow: number; partners: number;
  mannerPenalty: number; gaveReviews: number; againGiven: number;
  reviews: Rev[];
};
type Data = {
  generatedAt: number;
  summary: { users: number; rated: number; unrated: number; avgStar: number; withNever: number; withPenalty: number; totalReviews: number };
  rows: Row[];
};

const verdictJa = (v: string) =>
  v === 'again' ? '🙆 また回りたい' : v === 'never' ? '🙅 ごめんなさい' : v === 'romantic' ? '💘 異性として気になる' : v === 'neutral' ? '😐 どちらでもない' : v || '—';

const fmt = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default function AdminRatingsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention' | 'rated' | 'unrated'>('all');

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
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/admin/ratings?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setData(j);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token); /* eslint-disable-next-line */ }, [token]);

  const rows = useMemo(() => {
    const all = data?.rows || [];
    const k = q.trim().toLowerCase();
    return all.filter((r) => {
      if (k && !r.name.toLowerCase().includes(k)) return false;
      if (filter === 'attention') return r.mannerPenalty > 0 || r.neverCount > 0;
      if (filter === 'rated') return r.roundedWith > 0;
      if (filter === 'unrated') return r.roundedWith === 0;
      return true;
    });
  }, [data, q, filter]);

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
        <button onClick={() => load()} className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-card shadow-card font-bold">{loading ? '更新中…' : '↻ 更新'}</button>
      </div>
      <div className="text-2xl font-black mb-1">⭐ 評価の状況（全員）</div>
      <div className="text-[11px] text-muted mb-3">
        ★＝また回りたい率。レビューをくれた人のうち「ごめんなさい」が何人かで決まります。名前をタップすると、誰からどう評価されたかが開きます。
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded-xl mb-3 text-[12px]">エラー: {err}</div>}

      {s && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Kpi label="評価がある人" value={`${s.rated}人`} sub={`未評価 ${s.unrated}人`} accent="text-green" />
          <Kpi label="平均★" value={s.avgStar ? `★${s.avgStar.toFixed(1)}` : '—'} sub={`レビュー ${s.totalReviews}件`} accent="text-blue" />
          <Kpi label="ごめんなさりあり" value={`${s.withNever}人`} sub="1人以上から" accent="text-orange" />
          <Kpi label="運営ペナルティ" value={`${s.withPenalty}人`} sub="ドタキャン等" accent="text-red-600" />
        </div>
      )}

      <div className="flex gap-1.5 mb-2">
        {([['all', 'すべて'], ['attention', '要注意'], ['rated', '評価あり'], ['unrated', '未評価']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={'flex-1 py-1.5 rounded-full text-[11px] font-bold ' + (filter === k ? 'bg-green text-white' : 'bg-card text-sub shadow-card')}>
            {label}
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索"
        className="w-full border border-border rounded-xl px-3 py-2 text-[13px] bg-card mb-3" />

      {!data && !err && <div className="text-center text-xs text-muted py-8">読み込み中...</div>}

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const isOpen = open === r.id;
          return (
            <div key={r.id} className="bg-card rounded-xl shadow-card">
              <button onClick={() => setOpen(isOpen ? '' : r.id)} className="w-full flex items-center gap-2.5 p-3 text-left">
                {r.avatarUrl
                  ? <img src={r.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover flex-none" />
                  : <div className="w-10 h-10 rounded-full bg-bg flex-none grid place-items-center">🙂</div>}
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-black truncate">
                    {r.name}
                    {r.isTest && <span className="text-[10px] text-muted font-normal">（テスト）</span>}
                    {r.mannerPenalty > 0 && <span className="ml-1.5 text-[10px] font-black text-red-600 bg-red-50 border border-red-300 rounded-full px-1.5">⚠️{r.mannerPenalty}</span>}
                  </div>
                  <div className="text-[10.5px] text-muted mt-0.5">
                    {r.star == null
                      ? '🆕 まだ評価なし'
                      : <>★{r.star.toFixed(1)}<span className="ml-1">（{r.roundedWith}人が評価・また回りたい{r.againRate}%）</span></>}
                  </div>
                  <div className="text-[10px] text-muted">
                    ⛳ 参加{r.joined} ・ 主催{r.hosted}
                    {r.noShow > 0 && <span className="text-red-600 font-bold"> ・ 当日欠席{r.noShow}</span>}
                    {r.neverCount > 0 && <span className="text-orange font-bold"> ・ 🙅{r.neverCount}</span>}
                  </div>
                </div>
                <span className="text-muted text-[11px] flex-none">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                    <Mini label="一緒に回った" value={`${r.partners}人`} />
                    <Mini label="また回りたい" value={`${r.againCount}/${r.roundedWith}`} />
                    <Mini label="ごめんなさい" value={`${r.neverCount}人`} danger={r.neverCount > 0} />
                    <Mini label="当日欠席" value={`${r.noShow}回`} danger={r.noShow > 0} />
                    <Mini label="自分がした評価" value={`${r.gaveReviews}件`} />
                    <Mini label="運営ペナルティ" value={`${r.mannerPenalty}`} danger={r.mannerPenalty > 0} />
                  </div>

                  <div className="text-[11px] font-bold text-sub mb-1">📝 受けた評価（{r.reviews.length}件・新しい順）</div>
                  {r.reviews.length === 0 ? (
                    <div className="text-[11px] text-muted py-2">まだありません。</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {r.reviews.map((v, i) => (
                        <div key={i} className={'rounded-lg p-2 border ' + (v.verdict === 'never' ? 'bg-red-50 border-red-200' : 'bg-bg border-border')}>
                          <div className="flex items-center gap-2 text-[11.5px]">
                            <span className="font-bold truncate">{v.fromName}</span>
                            <span className="text-sub">{verdictJa(v.verdict)}</span>
                            <span className="ml-auto text-[10px] text-muted flex-none">{fmt(v.ts)}</span>
                          </div>
                          {v.comment && <div className="text-[11.5px] text-text mt-1 whitespace-pre-wrap leading-relaxed">{v.comment}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5 mt-2.5">
                    <a href={appProfileUrl(r.id)} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-bg border border-border text-[11px] font-bold">👤 プロフィール</a>
                    <Link href={`/admin/manner?token=${token}`} className="flex-1 text-center py-2 rounded-lg bg-bg border border-border text-[11px] font-bold">🙅 評価を下げる</Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {data && rows.length === 0 && <div className="text-center text-[12px] text-muted py-8">該当する人はいません。</div>}
      </div>

      <div className="text-[10.5px] text-muted mt-4 leading-relaxed">
        ※ ★は「レビューをくれた人のうち、ごめんなさいを付けた人の割合」から算出しています（アプリの表示と同じ計算）。まだ誰からもレビューをもらっていない人は「🆕 まだ評価なし」です。
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-card rounded-xl p-3 shadow-card">
      <div className="text-[10px] text-muted font-bold">{label}</div>
      <div className={`text-[19px] font-black leading-tight ${accent || ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="bg-bg rounded-lg p-2 text-center">
      <div className={'text-[13px] font-black ' + (danger ? 'text-red-600' : '')}>{value}</div>
      <div className="text-[9px] text-muted mt-0.5">{label}</div>
    </div>
  );
}
