'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：再会エンジンの設定（通知タイミング等）＋「今すぐ実行」＋5段ファネル。
// テスト時は「通知までの日数」を 0 にすると、完了済みラウンドの相互マッチ済みペアへ即通知される。

export default function AdminRematchPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

type Cfg = { intervalDays: number; maxCycles: number; candidateWindowDays: number; enabled: boolean; testMode: boolean; testUserIds: string[] };
const FUNNEL_LABELS: { key: string; label: string }[] = [
  { key: 'rematch_notify_open', label: '① 通知タップ' },
  { key: 'rematch_input_one', label: '② 片方が候補入力' },
  { key: 'rematch_input_both', label: '③ 両者が候補入力' },
  { key: 'rematch_agreed', label: '④ 日程確定（成功）' },
  { key: 'rematch_to_round_post', label: '⑤ ラウンド投稿へ' },
];

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  // テストユーザーIDはテキストのまま保持（改行できるよう、保存時にだけ整形する）。
  const [testIdsText, setTestIdsText] = useState('');

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

  async function load() {
    if (!token) return;
    try {
      const r = await fetch(`/api/admin/rematch-config?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setCfg(j.config); setFunnel(j.funnel || {}); setTestIdsText(((j.config?.testUserIds) || []).join('\n')); }
    } catch {}
    setLoaded(true);
  }
  useEffect(() => { if (token) load(); }, [token]);

  async function save() {
    if (!cfg || !token) return;
    setSaving(true); setMsg('');
    try {
      const testUserIds = testIdsText.split('\n').map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`/api/admin/rematch-config?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cfg, testUserIds }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setCfg(j.config);
      setTestIdsText(((j.config?.testUserIds) || []).join('\n'));
      setMsg('保存しました ✅');
    } catch (e) { setMsg('保存失敗: ' + (e as Error).message); }
    setSaving(false);
  }

  async function resetData() {
    if (!token) return;
    if (!confirm('再会エンジンのテストデータ（セッション＋計測）を全削除しますか？\n進行中の候補日・決定済みもすべて消えます。')) return;
    setRunning(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/rematch-reset?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`リセットしました：セッション ${j.deletedSessions} 件 / 計測 ${j.deletedEvents} 件を削除`);
      load();
    } catch (e) { setMsg('リセット失敗: ' + (e as Error).message); }
    setRunning(false);
  }

  async function runNow() {
    if (!token) return;
    setRunning(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/rematch-run?token=${encodeURIComponent(token)}`, { method: 'POST', cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`実行しました：再会通知 ${j.sent} 件送信（対象ペア ${j.pairs}）${j.enabled === false ? '※機能OFF中' : ''}`);
      load();
    } catch (e) { setMsg('実行失敗: ' + (e as Error).message); }
    setRunning(false);
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🔁 再会エンジン</div>
      <div className="text-[12px] text-muted mb-4 leading-relaxed">
        相互マッチ（また回りたい両思い）済みのペアに、前回完了から一定日数後に「再会のお知らせ」を送る機能の設定。<br />
        <b>テスト時は「通知までの日数」を 0 にして「今すぐ実行」</b>を押すと、完了済みラウンドの相互マッチ済みペアへ即通知されます。
      </div>

      {!loaded || !cfg ? (
        <div className="text-sm text-muted">読み込み中...</div>
      ) : (
        <>
          <div className="bg-card rounded-xl shadow-card p-4 mb-3">
            <label className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-bold">機能を有効にする</span>
              <input type="checkbox" className="w-5 h-5 accent-green" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
            </label>
            <label className={`flex items-center justify-between mb-2 p-2.5 rounded-lg border-[1.5px] ${cfg.testMode ? 'border-green bg-green-light' : 'border-red-300 bg-red-50'}`}>
              <span className="text-[13px] font-bold">🧪 テストモード（テストアカウントのみに通知）</span>
              <input type="checkbox" className="w-5 h-5 accent-green" checked={cfg.testMode} onChange={(e) => setCfg({ ...cfg, testMode: e.target.checked })} />
            </label>
            <div className={`text-[11px] mb-3 leading-relaxed ${cfg.testMode ? 'text-green' : 'text-red-600 font-bold'}`}>
              {cfg.testMode
                ? 'ON：テスト扱いユーザー同士のペアにしか再会通知は飛びません。実ユーザーには一切飛びません（安全）。'
                : '⚠️ OFF：実ユーザーにも再会通知が飛びます。過去に相互マッチした実ユーザーへ通知される可能性があります。本番運用の準備が整ってからOFFにしてください。'}
            </div>
            <Field label="テスト扱いにするLINEユーザーID（1行1つ）" hint="自分のスマホでテストする用">
              <textarea
                value={testIdsText}
                onChange={(e) => setTestIdsText(e.target.value)}
                rows={4}
                placeholder={'Uxxxxxxxxxxxxxxxx\nUyyyyyyyyyyyyyyyy\n（1行1つ・自分や仲間のLINE userId）'}
                className="w-full p-2.5 border-[1.5px] border-border rounded-lg text-[11px] font-mono bg-bg outline-none resize-y"
              />
              <div className="text-[10px] text-muted mt-1">※ ここに入れたIDは test_ アカウントと同じく「テスト扱い」になり、テストモード中でも再会通知の対象になります。自分のuserIdは「👥 ユーザー管理」で確認できます。</div>
            </Field>
            <Field label="通知までの日数（前回完了から / サイクル間隔）" hint="テストは 0（=即時）">
              <input type="number" min={0} max={365} value={cfg.intervalDays}
                onChange={(e) => setCfg({ ...cfg, intervalDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                className="w-full p-2.5 border-[1.5px] border-border rounded-lg text-sm bg-bg outline-none" />
            </Field>
            <Field label="同一ペアへの通知の最大回数">
              <input type="number" min={1} max={10} value={cfg.maxCycles}
                onChange={(e) => setCfg({ ...cfg, maxCycles: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                className="w-full p-2.5 border-[1.5px] border-border rounded-lg text-sm bg-bg outline-none" />
            </Field>
            <Field label="候補日カレンダーの範囲（今後◯日）">
              <input type="number" min={7} max={180} value={cfg.candidateWindowDays}
                onChange={(e) => setCfg({ ...cfg, candidateWindowDays: Math.max(7, Math.min(180, Number(e.target.value) || 45)) })}
                className="w-full p-2.5 border-[1.5px] border-border rounded-lg text-sm bg-bg outline-none" />
            </Field>
            <button onClick={save} disabled={saving} className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
              {saving ? '保存中…' : 'この設定で保存する'}
            </button>
          </div>

          <button onClick={runNow} disabled={running} className="w-full py-3 bg-orange text-white rounded-xl text-sm font-black disabled:opacity-50 mb-2">
            {running ? '実行中…' : '▶ 再会通知を今すぐ実行（テスト）'}
          </button>
          <button onClick={resetData} disabled={running} className="w-full py-2.5 bg-card border-[1.5px] border-red-300 text-red-600 rounded-xl text-[13px] font-bold disabled:opacity-50 mb-3">
            🗑 テストデータをリセット（再会セッション全削除）
          </button>
          {msg && <div className="text-[12px] text-center mb-3 font-bold">{msg}</div>}

          <div className="bg-card rounded-xl shadow-card p-4">
            <div className="text-[13px] font-black mb-2">📊 ファネル（累計）</div>
            <div className="flex flex-col gap-1.5">
              {FUNNEL_LABELS.map((f) => (
                <div key={f.key} className="flex items-center justify-between text-[13px]">
                  <span className="font-bold text-sub">{f.label}</span>
                  <span className="font-black">{funnel[f.key] ?? 0}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-muted mt-2">※ ①は通知を開いた回数。④「日程確定」が本機能の成功指標。</div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold text-sub mb-1">{label}{hint && <span className="text-muted font-medium">（{hint}）</span>}</label>
      {children}
    </div>
  );
}
