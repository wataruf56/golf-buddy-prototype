'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type SwingRow = {
  swingId: string;
  userId: string;
  mode: string;
  status: string;
  createdAt: number;
  startedAnalyzingAt?: number;
  updatedAt?: number;
  completedAt?: number;
  errorMessage?: string;
  hasReview: boolean;
};

type Overview = {
  now: number;
  counts: Record<string, number>;
  stuckCount: number;
  requeuedCount: number;
  recent: {
    analyzing: SwingRow[];
    failed: SwingRow[];
    queued: SwingRow[];
    done: SwingRow[];
  };
  stuckSwings: SwingRow[];
};

const STATUS_COLOR: Record<string, string> = {
  queued: 'bg-bg text-sub',
  analyzing: 'bg-orange-light text-orange',
  done: 'bg-green-light text-green',
  failed: 'bg-red-50 text-red-600',
};

export default function AdminSwingPage() {
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
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    if (t) setToken(t);
  }, [tokenFromUrl]);

  async function load(requeueAll = false) {
    if (!token) return;
    setBusy(true);
    setErr('');
    try {
      const u = `/api/admin/swings-overview?token=${encodeURIComponent(token)}${requeueAll ? '&requeue=1' : ''}`;
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Load on mount + every 30s while page is open.
  useEffect(() => {
    if (!token) return;
    load();
    const iv = setInterval(() => load(), 30_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">🏌️ スイング解析モニタ</div>
        <div className="w-8" />
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-xs">{err}</div>}

      {!token && (
        <div className="bg-card rounded-xl p-4 text-center text-xs text-sub shadow-card">
          管理トークン読み込み中... (空のままなら /admin に戻って再ログインしてください)
        </div>
      )}

      {data && (
        <>
          {/* Status counts */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <CountTile label="queued" value={data.counts.queued} tone="bg-bg text-sub" />
            <CountTile label="analyzing" value={data.counts.analyzing} tone="bg-orange-light text-orange" />
            <CountTile label="done" value={data.counts.done} tone="bg-green-light text-green" />
            <CountTile label="failed" value={data.counts.failed} tone="bg-red-50 text-red-600" />
          </div>

          {/* Stuck banner + bulk action */}
          {data.stuckCount > 0 ? (
            <div className="bg-orange-light border-[1.5px] border-orange rounded-card p-3 mb-3">
              <div className="text-[12px] font-black text-orange mb-1">
                🚨 {data.stuckCount} 件が要対応 (5分以上 stuck / 直近1時間以内に失敗)
              </div>
              <div className="text-[10px] text-sub mb-2">
                自動復旧cron が5分おきに走ってますが、その場で手動再キューしたい場合は ↓
              </div>
              <button
                onClick={() => load(true)}
                disabled={busy}
                className="w-full py-2 bg-orange text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {busy ? '...' : `🔄 全部まとめて再キュー (${data.stuckCount}件)`}
              </button>
            </div>
          ) : (
            <div className="bg-green-light border-[1.5px] border-green rounded-card p-2.5 mb-3 text-[12px] font-black text-green text-center">
              ✓ stuck/failed 案件なし — 正常稼働中
            </div>
          )}

          {data.requeuedCount > 0 && (
            <div className="bg-orange-light text-orange p-2 rounded mb-3 text-[11px] font-bold text-center">
              {data.requeuedCount} 件を再キューしました
            </div>
          )}

          <Section title="🚨 stuck / failed (要対応)" items={data.stuckSwings} now={data.now} />
          <Section title="⏳ analyzing (進行中)" items={data.recent.analyzing} now={data.now} />
          <Section title="❌ failed (直近1時間)" items={data.recent.failed} now={data.now} />
          <Section title="📋 queued (待機中)" items={data.recent.queued} now={data.now} />
          <Section title="✅ done (最新5件)" items={data.recent.done} now={data.now} />

          <div className="text-[10px] text-muted text-center mt-3 pb-6">
            自動更新: 30秒おき ・ 最終更新 {new Date(data.now).toLocaleTimeString('ja-JP')}
          </div>
        </>
      )}
    </div>
  );
}

function CountTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl p-2 text-center ${tone}`}>
      <div className="text-xl font-black">{value}</div>
      <div className="text-[9px] font-bold opacity-80">{label}</div>
    </div>
  );
}

function Section({ title, items, now }: { title: string; items: SwingRow[]; now: number }) {
  if (!items?.length) return null;
  return (
    <div className="mb-4">
      <div className="text-[11px] font-bold text-sub px-1 mb-1.5">{title}</div>
      <div className="flex flex-col gap-1.5">
        {items.map((s) => <Row key={s.swingId} s={s} now={now} />)}
      </div>
    </div>
  );
}

function Row({ s, now }: { s: SwingRow; now: number }) {
  const elapsedMin = s.startedAnalyzingAt
    ? Math.round((now - s.startedAnalyzingAt) / 60_000)
    : null;
  return (
    <div className="bg-card rounded-xl p-2.5 shadow-card">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[11px] font-bold">{s.mode}</div>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[s.status] || 'bg-bg text-sub'}`}>
          {s.status}
        </span>
      </div>
      <div className="text-[10px] text-muted">
        {new Date(s.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {elapsedMin !== null && s.status === 'analyzing' && (
          <span className={`ml-2 ${elapsedMin > 5 ? 'text-red-600 font-bold' : ''}`}>
            ({elapsedMin}分経過)
          </span>
        )}
      </div>
      {s.errorMessage && (
        <div className="mt-1 text-[10px] text-red-600 break-words leading-snug">{s.errorMessage}</div>
      )}
      <div className="mt-0.5 text-[9px] font-mono text-muted truncate">
        {s.userId.slice(0, 10)}… / {s.swingId.slice(0, 10)}…
      </div>
    </div>
  );
}
