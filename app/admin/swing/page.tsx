'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type SwingSummary = {
  swingId: string;
  status: string;
  mode: string;
  createdAt: number;
  startedAnalyzingAt?: number;
  errorMessage?: string;
  hasReview: boolean;
  videoGcsPath?: string;
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
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = tokenFromUrl || localStorage.getItem('gb_admin_token') || '';
    if (tokenFromUrl) localStorage.setItem('gb_admin_token', tokenFromUrl);
    setToken(t);
  }, [tokenFromUrl]);

  async function load(requeue = false) {
    if (!token || !userId) { setErr('userId を入力してください'); return; }
    setBusy(true);
    setErr('');
    try {
      const u = `/api/admin/swing-test?token=${encodeURIComponent(token)}&userId=${encodeURIComponent(userId)}${requeue ? '&requeue=1' : ''}`;
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${r.status}`);
      setData(await r.json());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Link href={`/admin?token=${token}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="flex-1 text-center text-base font-black">🏌️ スイング解析</div>
        <div className="w-8" />
      </div>

      <div className="bg-card rounded-xl p-3 mb-3 shadow-card">
        <div className="text-xs font-bold mb-2">対象ユーザーID</div>
        <input
          type="text"
          placeholder="U41f8..."
          value={userId}
          onChange={(e) => setUserId(e.target.value.trim())}
          className="w-full p-2.5 mb-2 border-[1.5px] border-border rounded-lg text-xs font-mono bg-bg outline-none"
        />
        <div className="flex gap-2">
          <button onClick={() => load(false)} disabled={busy || !userId} className="flex-1 py-2 bg-green text-white rounded-lg text-xs font-bold disabled:opacity-50">
            {busy ? '...' : '🔍 履歴取得'}
          </button>
          <button onClick={() => load(true)} disabled={busy || !userId} className="flex-1 py-2 bg-orange text-white rounded-lg text-xs font-bold disabled:opacity-50">
            🔄 失敗/Stuckを再キュー
          </button>
        </div>
      </div>

      {err && <div className="bg-red-50 text-red-700 p-3 rounded mb-3 text-sm">{err}</div>}

      {data && (
        <>
          {data.requeued > 0 && (
            <div className="bg-orange-light text-orange p-2.5 rounded mb-3 text-xs font-bold text-center">
              {data.requeued} 件を再キューしました
            </div>
          )}

          <div className="bg-card rounded-xl p-3 mb-3 shadow-card">
            <div className="text-xs font-bold mb-2">📊 環境状態</div>
            <div className="text-[11px] space-y-0.5 font-mono">
              <div>SWING_ANALYZER_URL: {data.env?.SWING_ANALYZER_URL ? '✓' : '✗'}</div>
              <div>SHARED_SECRET: {data.env?.SWING_ANALYZER_SHARED_SECRET ? '✓' : '✗'}</div>
              <div>GCS_PROJECT_ID: {data.env?.GCS_PROJECT_ID || '✗'}</div>
              <div>GCS_BUCKET: {data.env?.GCS_BUCKET || '✗'}</div>
              <div>GCS_SA_KEY_JSON: {data.env?.GCS_SA_KEY_JSON_present ? `✓ (${data.env.GCS_SA_KEY_JSON_length}b)` : '✗'}</div>
              <div>CRON_SECRET: {data.env?.CRON_SECRET ? '✓' : '✗'}</div>
              <div>Signed URL test: {data.signedUrlOk ? '✓ 成功' : `✗ ${data.signedUrlErr || ''}`}</div>
            </div>
          </div>

          <div className="text-xs font-bold mb-2 px-1">解析履歴 ({data.swings?.length || 0})</div>
          <div className="flex flex-col gap-2 pb-10">
            {data.swings?.map((s: SwingSummary) => (
              <div key={s.swingId} className="bg-card rounded-xl p-3 shadow-card">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold">{s.mode}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] || 'bg-bg text-sub'}`}>
                    {s.status}
                  </span>
                </div>
                <div className="text-[10px] text-muted">
                  {new Date(s.createdAt).toLocaleString('ja-JP')}
                </div>
                {s.errorMessage && (
                  <div className="mt-1 text-[10px] text-red-600 break-words">{s.errorMessage}</div>
                )}
                <div className="mt-1 text-[10px] font-mono text-muted truncate">{s.swingId}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
