'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面「📰 タイムラインの閲覧」（2026-10-17）。
// 日ごと・週ごと（月曜はじまり）・月ごとに、開かれた回数・見た人数・見ていた時間（合計・1回あたりの平均と中央値）と、
// 今日の写真の投稿数・リアクション数。テスト垢は数えない。API: /api/admin/timeline-stats
type Row = { key: string; views: number; users: number; totalMs: number; avgMs: number; medianMs: number; posts: number; reactions: number };
type Data = { days: number; total: { views: number; users: number; totalMs: number; avgMs: number; medianMs: number }; day: Row[]; week: Row[]; month: Row[] };

const WD = '日月火水木金土';
function dur(ms: number) {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${s % 60 ? `${s % 60}秒` : ''}`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}
function label(kind: 'day' | 'week' | 'month', key: string) {
  if (kind === 'month') return `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`;
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (kind === 'week') { const e = new Date(y, m - 1, d + 6); return `${m}/${d}〜${e.getMonth() + 1}/${e.getDate()}`; }
  return `${m}/${d}（${WD[dt.getDay()]}）`;
}

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const token = useSearchParams()?.get('token') || '';
  const [days, setDays] = useState(120);
  const [kind, setKind] = useState<'day' | 'week' | 'month'>('day');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch(`/api/admin/timeline-stats?token=${encodeURIComponent(token)}&days=${days}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || String(r.status));
      setData(j);
    } catch (e) { setErr((e as Error).message); }
  }, [token, days]);
  useEffect(() => { load(); }, [load]);

  const rows = data ? data[kind] : [];
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  return (
    <div className="max-w-[860px] mx-auto p-4">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
        <button onClick={load} className="ml-auto text-[11px] px-2.5 py-1 rounded-full bg-card shadow-card font-bold">↻ 更新</button>
      </div>
      <div className="text-2xl font-black mb-1">📰 タイムラインの閲覧</div>
      <div className="text-[11px] text-muted mb-3 leading-relaxed">
        開かれた回数＝タイムラインの画面を開いた回数。見た人数＝その期間に1回以上開いた人。見ていた時間＝画面が見えていた時間（裏に回した時間は数えない・1回30分まで）。
        平均・中央値は時間が取れた回だけで計算。テスト垢は数えません。記録は 2026-10-17 から。
      </div>
      {err && <div className="bg-red-50 text-red-700 p-3 rounded-xl mb-3 text-[12px]">エラー: {err}</div>}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Kpi label={`開かれた回数（${data.days}日）`} value={`${data.total.views}回`} />
          <Kpi label="見た人数" value={`${data.total.users}人`} />
          <Kpi label="見ていた時間の合計" value={dur(data.total.totalMs)} />
          <Kpi label="1回あたり 平均／中央値" value={`${dur(data.total.avgMs)}／${dur(data.total.medianMs)}`} />
        </div>
      )}
      <div className="flex gap-1.5 mb-2 flex-wrap items-center">
        {(['day', 'week', 'month'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={'px-3 py-1.5 rounded-full text-[12px] font-black border ' + (kind === k ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}>
            {k === 'day' ? '日ごと' : k === 'week' ? '週ごと' : '月ごと'}
          </button>
        ))}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-auto border border-border rounded-lg px-2 py-1 text-[12px] bg-white">
          {[30, 60, 120, 365].map((d) => <option key={d} value={d}>直近{d}日</option>)}
        </select>
      </div>
      <div className="bg-card rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-sub border-b border-border">
              <th className="p-2">{kind === 'day' ? '日' : kind === 'week' ? '週（月〜日）' : '月'}</th>
              <th className="p-2">開かれた回数</th><th className="p-2 text-right">見た人数</th><th className="p-2 text-right">時間の合計</th>
              <th className="p-2 text-right">平均</th><th className="p-2 text-right">中央値</th><th className="p-2 text-right">📸投稿</th><th className="p-2 text-right">リアクション</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted">まだ記録がありません</td></tr>}
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-b-0">
                <td className="p-2 font-bold whitespace-nowrap">{label(kind, r.key)}</td>
                <td className="p-2 min-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 rounded-full bg-green" style={{ width: `${Math.max(4, (r.views / maxViews) * 100)}px` }} />
                    <b>{r.views}</b>
                  </div>
                </td>
                <td className="p-2 text-right">{r.users}</td>
                <td className="p-2 text-right whitespace-nowrap">{dur(r.totalMs)}</td>
                <td className="p-2 text-right whitespace-nowrap">{dur(r.avgMs)}</td>
                <td className="p-2 text-right whitespace-nowrap">{dur(r.medianMs)}</td>
                <td className="p-2 text-right">{r.posts || '—'}</td>
                <td className="p-2 text-right">{r.reactions || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-3">
      <div className="text-[10.5px] text-muted font-bold">{label}</div>
      <div className="text-[18px] font-black mt-0.5">{value}</div>
    </div>
  );
}
