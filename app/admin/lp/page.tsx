'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getGolmotiType } from '@/lib/golmoti';

// 管理画面：LP診断レポート。/api/lp/quiz の集計（ADMIN_LOG_TOKEN 保護）を
// 取得して、来訪〜診断〜興味シグナルのファネル・需要プール・離脱を可視化する。

type Report = {
  scanned: number;
  uniqueSessions: number;
  uniqueVisitors: number;
  visits: number;
  starts: number;
  completes: number;
  signals: number;
  ctas: number;
  shares: number;
  completionRate: number | null;
  signalRate: number | null;
  uniqueSignalVisitors: number;
  byResult: Record<string, number>;
  byPattern: Record<string, number>;
  stepReach: Record<string, number>;
  demand: {
    areaCounts: Record<string, number>;
    dayCounts: Record<string, number>;
    comboCounts: Record<string, number>;
  };
  daily: { date: string; visit: number; start: number; complete: number; signal: number }[];
  serverTime: string;
};

export default function AdminLpReport() {
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
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // 他の管理画面と同じトークン取得パターン（/api/admin/init を正とする）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const t: string = j?.token || '';
        if (t) { localStorage.setItem('gb_admin_token', t); setToken(t); }
      } catch {}
    })();
  }, [tokenFromUrl]);

  async function load(t: string) {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/lp/quiz?token=${encodeURIComponent(t)}&limit=20000`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) { setErr(j?.error || `エラー (${r.status})`); setData(null); }
      else setData(j as Report);
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
  }

  useEffect(() => { if (token) load(token); }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center">
        <div className="text-sm text-muted">⚙️ 読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      </div>
      <div className="text-2xl font-black mb-1">📊 LP診断レポート</div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] text-muted">
          {data ? `集計 ${data.scanned} イベント` : '—'}
          {data?.serverTime && ` ・ ${new Date(data.serverTime).toLocaleString('ja-JP', { hour12: false })}`}
        </div>
        <button onClick={() => load(token)} className="text-[11px] px-2.5 py-1 rounded-full bg-card shadow-card font-bold">
          {loading ? '更新中…' : '↻ 更新'}
        </button>
      </div>

      {err && <div className="p-3 bg-red-light text-red rounded-xl text-sm mb-4">取得失敗: {err}</div>}
      {!data && !err && <div className="text-sm text-muted">読み込み中...</div>}

      {data && (
        <div className="flex flex-col gap-4">
          <Funnel data={data} />
          <Daily daily={data.daily} />
          <Demand demand={data.demand} signals={data.signals} uniq={data.uniqueSignalVisitors} />
          <DropOff stepReach={data.stepReach} starts={data.starts} />
          <ResultDist byResult={data.byResult} completes={data.completes} />
          <Patterns byPattern={data.byPattern} />
          <div className="text-[10px] text-muted text-center mt-2">
            ※ 直近 {data.scanned} 件のイベントを集計。LINEアカウントとの個人紐付けは次フェーズで対応予定。
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-4">
      <div className="text-sm font-black mb-0.5">{title}</div>
      {sub && <div className="text-[11px] text-muted mb-3">{sub}</div>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}

function pct(n: number, d: number) { return d > 0 ? Math.round((n / d) * 100) : 0; }

function Bar({ label, value, max, hint, color = 'bg-green' }: { label: string; value: number; max: number; hint?: string; color?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex justify-between items-baseline mb-1 gap-2">
        <span className="text-[12px] font-semibold truncate">{label}</span>
        <span className="text-[12px] font-black flex-shrink-0">{value}{hint && <span className="text-muted font-medium text-[10px] ml-1">{hint}</span>}</span>
      </div>
      <div className="w-full h-2 bg-bg rounded overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Funnel({ data }: { data: Report }) {
  const base = Math.max(data.visits, data.starts, data.uniqueVisitors, 1);
  return (
    <Card title="ファネル（来訪 → 完了 → 通知登録）" sub={`ユニーク訪問者 ${data.uniqueVisitors} 人`}>
      <Bar label="来訪 (visit)" value={data.visits} max={base} color="bg-blue" />
      <Bar label="診断スタート" value={data.starts} max={base} hint={`来訪比 ${pct(data.starts, data.visits)}%`} color="bg-green" />
      <Bar label="診断完了" value={data.completes} max={base} hint={`完了率 ${Math.round((data.completionRate || 0) * 100)}%`} color="bg-green" />
      <Bar label="興味シグナル登録" value={data.signals} max={base} hint={`完了比 ${Math.round((data.signalRate || 0) * 100)}%`} color="bg-orange" />
      <Bar label="CTAクリック" value={data.ctas} max={base} color="bg-orange" />
      <Bar label="シェア" value={data.shares} max={base} color="bg-blue" />
      <div className="mt-3 pt-3 border-t border-border text-[11px] text-sub">
        通知登録したユニーク人数：<b className="text-text">{data.uniqueSignalVisitors}</b> 人
      </div>
    </Card>
  );
}

function Daily({ daily }: { daily: Report['daily'] }) {
  const rows = daily.slice(-14);
  const max = Math.max(1, ...rows.map((r) => r.visit));
  if (!rows.length) return null;
  return (
    <Card title="日次の動き（直近14日 / JST）" sub="灰=来訪・緑=完了・橙=通知登録">
      <div className="flex items-end gap-1 h-28">
        {rows.map((r) => (
          <div key={r.date} className="flex-1 flex flex-col items-center justify-end gap-px h-full" title={`${r.date}  来訪${r.visit} 完了${r.complete} 登録${r.signal}`}>
            <div className="w-full flex flex-col justify-end items-center gap-px h-full">
              <div className="w-full bg-[#D5DDE0] rounded-t" style={{ height: `${pct(r.visit, max)}%` }} />
              <div className="w-full bg-green" style={{ height: `${pct(r.complete, max)}%` }} />
              <div className="w-full bg-orange rounded-b" style={{ height: `${pct(r.signal, max)}%` }} />
            </div>
            <div className="text-[8px] text-muted whitespace-nowrap">{r.date.slice(5)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function sortEntries(o: Record<string, number>) {
  return Object.entries(o).sort((a, b) => b[1] - a[1]);
}

function Demand({ demand, signals, uniq }: { demand: Report['demand']; signals: number; uniq: number }) {
  const combos = sortEntries(demand.comboCounts).slice(0, 8);
  const areas = sortEntries(demand.areaCounts);
  const days = sortEntries(demand.dayCounts);
  const maxC = combos.length ? combos[0][1] : 1;
  const maxA = areas.length ? areas[0][1] : 1;
  return (
    <Card title="需要プール（エリア × 曜日）" sub={`通知登録 ${signals} 件 / ${uniq} 人が「ここで募集が欲しい」と意思表示`}>
      {signals === 0 ? (
        <div className="text-[12px] text-muted">まだ興味シグナルの登録がありません。</div>
      ) : (
        <>
          <div className="text-[11px] font-bold text-sub mb-2">「◯人待ち」上位の組み合わせ</div>
          {combos.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxC} hint="人待ち" color="bg-orange" />)}
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
            <div>
              <div className="text-[11px] font-bold text-sub mb-2">エリア別</div>
              {areas.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxA} color="bg-green" />)}
            </div>
            <div>
              <div className="text-[11px] font-bold text-sub mb-2">曜日別</div>
              {days.map(([k, v]) => <Bar key={k} label={k} value={v} max={maxA} color="bg-blue" />)}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function DropOff({ stepReach, starts }: { stepReach: Record<string, number>; starts: number }) {
  const steps = Object.keys(stepReach)
    .map((q) => ({ q, n: stepReach[q], i: parseInt(q.replace(/\D/g, ''), 10) || 0 }))
    .sort((a, b) => a.i - b.i);
  if (!steps.length) return null;
  const base = Math.max(starts, steps[0]?.n || 1);
  return (
    <Card title="設問ごとの到達（離脱分析）" sub="どの設問で抜けているかが分かります">
      <Bar label="スタート" value={starts} max={base} color="bg-blue" />
      {steps.map((s) => (
        <Bar key={s.q} label={`Q${s.i}`} value={s.n} max={base} hint={`到達 ${pct(s.n, starts)}%`} color="bg-green" />
      ))}
    </Card>
  );
}

function ResultDist({ byResult, completes }: { byResult: Record<string, number>; completes: number }) {
  const rows = sortEntries(byResult);
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <Card title="診断結果タイプの分布" sub={`完了 ${completes} 件の内訳`}>
      {rows.map(([code, v]) => {
        const t = getGolmotiType(code);
        const label = t ? `${t.emoji} ${t.name}` : code;
        return <Bar key={code} label={label} value={v} max={max} hint={`${pct(v, completes)}%`} color="bg-green" />;
      })}
    </Card>
  );
}

function Patterns({ byPattern }: { byPattern: Record<string, number> }) {
  const rows = sortEntries(byPattern).slice(0, 8);
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <Card title="多い回答パターン Top8" sub="完全一致の回答列（q1:..,q2:..）">
      {rows.map(([p, v]) => (
        <div key={p} className="mb-2.5 last:mb-0">
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <span className="text-[10px] font-mono text-sub truncate">{p}</span>
            <span className="text-[12px] font-black flex-shrink-0">{v}</span>
          </div>
          <div className="w-full h-1.5 bg-bg rounded overflow-hidden">
            <div className="h-full bg-blue rounded" style={{ width: `${pct(v, max)}%` }} />
          </div>
        </div>
      ))}
    </Card>
  );
}
