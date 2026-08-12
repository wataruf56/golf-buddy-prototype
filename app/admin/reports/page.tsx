'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

type Report = {
  id: string;
  reporterId: string; reporterName: string;
  targetId: string; targetName: string;
  reason: string; detail: string; roundId: string | null;
  status: string; createdAt: number;
};

const reasonJa = (r: string) =>
  r === 'inappropriate' ? '🚫 不適切な行為' : r === 'noshow' ? '🙅 ドタキャン' : r === 'no_contact' ? '📵 連絡が取れない' : '⚠️ その他';

export default function AdminReportsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [showResolved, setShowResolved] = useState(false);

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
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/reports?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setReports(j.reports || []);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token); /* eslint-disable-next-line */ }, [token]);

  // 通報からの操作も `/admin/manner` の履歴に残るよう、通報理由と通報IDをメモに添えて送る。
  async function adjustManner(userId: string, delta: 1 | -1, name: string, rep?: Report) {
    if (busy) return;
    if (delta === 1 && !window.confirm(`${name} さんのマナー評価を下げます（事実確認済みですか？）。よろしいですか？`)) return;
    setBusy(userId + delta); setMsg('');
    try {
      const r = await fetch(`/api/admin/manner?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId, delta,
          reason: rep?.reason || 'report',
          note: rep ? `通報から対応（通報者: ${rep.reporterName || rep.reporterId}）${rep.detail ? `\n${rep.detail}` : ''}` : '',
          roundId: rep?.roundId || '',
        }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`✅ ${name} さんのマナーペナルティ: ${j.mannerPenalty}`);
    } catch (e) { setMsg('失敗: ' + (e as Error).message); }
    finally { setBusy(''); }
  }

  async function setStatus(id: string, action: 'resolve' | 'reopen') {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/reports?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(`${r.status}`);
      await load();
    } catch (e) { setMsg('失敗: ' + (e as Error).message); }
    finally { setBusy(''); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const visible = reports.filter((r) => showResolved || r.status !== 'resolved');
  const openCount = reports.filter((r) => r.status !== 'resolved').length;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🚨 通報の管理</div>
      <div className="text-[12px] text-muted mb-3">未対応 {openCount} 件。事実確認のうえ「評価を下げる」や通報者とのチャットができます。</div>

      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => load()} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold">🔄 更新</button>
        <label className="text-[12px] text-sub flex items-center gap-1 ml-auto">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> 対応済みも表示
        </label>
      </div>
      {msg && <div className="text-[12px] font-bold text-center mb-2">{msg}</div>}

      {loading ? (
        <div className="text-center text-sm text-muted py-10">読み込み中...</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-sm text-muted py-10">通報はありません。</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((r) => (
            <div key={r.id} className={'bg-card rounded-xl shadow-card p-4 ' + (r.status === 'resolved' ? 'opacity-60' : '')}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-black">{reasonJa(r.reason)}</span>
                <span className="text-[10px] text-muted">{r.createdAt ? new Date(r.createdAt).toLocaleString('ja-JP') : ''}</span>
              </div>
              <div className="text-[13px] mb-1">
                対象：<a href={appProfileUrl(r.targetId)} target="_blank" rel="noreferrer" className="font-bold text-blue underline">{r.targetName || r.targetId.slice(0, 10)}</a>
              </div>
              <div className="text-[12px] text-sub mb-1">通報者：{r.reporterName || r.reporterId.slice(0, 10)}</div>
              {r.detail && <div className="text-[13px] bg-bg rounded-lg p-2.5 my-2 whitespace-pre-wrap leading-relaxed">{r.detail}</div>}
              {r.status === 'resolved' && <div className="text-[11px] font-bold text-green mb-2">✅ 対応済み</div>}

              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <button onClick={() => adjustManner(r.targetId, 1, r.targetName || '対象', r)} disabled={!!busy} className="py-2.5 bg-red-500 text-white rounded-lg text-xs font-black disabled:opacity-50">評価を下げる</button>
                <button onClick={() => adjustManner(r.targetId, -1, r.targetName || '対象', r)} disabled={!!busy} className="py-2.5 bg-bg border border-border text-sub rounded-lg text-xs font-bold disabled:opacity-50">↩ 戻す</button>
                <Link href={`/admin/support?token=${token}&userId=${r.reporterId}`} className="py-2.5 bg-green text-white rounded-lg text-xs font-black text-center">🛡️ 通報者とチャット</Link>
                {r.status === 'resolved'
                  ? <button onClick={() => setStatus(r.id, 'reopen')} disabled={!!busy} className="py-2.5 bg-bg border border-border text-sub rounded-lg text-xs font-bold disabled:opacity-50">未対応に戻す</button>
                  : <button onClick={() => setStatus(r.id, 'resolve')} disabled={!!busy} className="py-2.5 bg-bg border border-border text-sub rounded-lg text-xs font-bold disabled:opacity-50">対応済みにする</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
