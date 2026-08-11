'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// 管理画面：ドタキャン等の報告を受けたときに、対象ユーザーを検索して評価を下げる。
// アプリ内の通報経由（/admin/reports）と違い、LINE等で直接報告を受けたケースに使う。
// 下げた記録は履歴に残り、1件ずつ取り消せる。

type U = { id: string; displayName: string; avatarUrl: string; area: string; age: number | null; isTest: boolean; mannerPenalty: number };
type Log = { id: string; userId: string; userName: string; delta: number; reason: string; note: string; roundId: string; roundTitle: string; undone: boolean; createdAt: number };

const REASONS: Array<{ v: string; label: string }> = [
  { v: 'noshow', label: '🙅 ドタキャン（当日キャンセル・無断欠席）' },
  { v: 'late', label: '⏰ 遅刻・進行を乱した' },
  { v: 'no_contact', label: '📵 連絡が取れない' },
  { v: 'inappropriate', label: '🚫 不適切な行為' },
  { v: 'other', label: '⚠️ その他' },
];
const reasonJa = (v: string) => REASONS.find((r) => r.v === v)?.label || (v === 'report' ? '🚨 通報対応' : '⚠️ その他');

const fmt = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AdminMannerPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [users, setUsers] = useState<U[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<U | null>(null);
  const [reason, setReason] = useState('noshow');
  const [note, setNote] = useState('');

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
      const r = await fetch(`/api/admin/manner?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setUsers(j.users || []); setLogs(j.logs || []); }
      else setMsg('読み込み失敗: ' + (j?.error || r.status));
    } catch (e) { setMsg('読み込み失敗: ' + (e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(token); /* eslint-disable-next-line */ }, [token]);

  const matches = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return [];
    return users.filter((u) => u.displayName.toLowerCase().includes(k) || u.id.toLowerCase().includes(k)).slice(0, 12);
  }, [q, users]);

  const flagged = users.filter((u) => u.mannerPenalty > 0);

  async function apply() {
    if (!picked || busy) return;
    const label = REASONS.find((r) => r.v === reason)?.label || reason;
    if (!window.confirm(`${picked.displayName} さんの評価を下げます。\n\n理由：${label}\n\n事実確認は済んでいますか？`)) return;
    setBusy('apply'); setMsg('');
    try {
      const r = await fetch(`/api/admin/manner?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: picked.id, delta: 1, reason, note }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`✅ ${picked.displayName} さんの評価を下げました（ペナルティ ${j.mannerPenalty}）`);
      setPicked(null); setQ(''); setNote(''); setReason('noshow');
      await load();
    } catch (e) { setMsg('失敗: ' + (e as Error).message); }
    finally { setBusy(''); }
  }

  async function undo(log: Log) {
    if (busy) return;
    if (!window.confirm(`${log.userName} さんの「${reasonJa(log.reason)}」を取り消して、評価を元に戻します。よろしいですか？`)) return;
    setBusy(log.id); setMsg('');
    try {
      const r = await fetch(`/api/admin/manner?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', logId: log.id }), cache: 'no-store',
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `${r.status}`);
      setMsg(`↩️ 取り消しました（ペナルティ ${j.mannerPenalty}）`);
      await load();
    } catch (e) { setMsg('失敗: ' + (e as Error).message); }
    finally { setBusy(''); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-16">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🙅 ドタキャン・マナー管理</div>
      <div className="text-[12px] text-muted mb-3">
        LINE等でドタキャンの報告を受けたとき、事実確認のうえ対象の人の評価を下げます。下げるとその人のプロフィールに「⚠️ 運営から注意あり」が表示されます。あとから取り消せます。
      </div>

      {msg && <div className="mb-3 text-[12px] font-bold bg-card border border-border rounded-xl p-2.5">{msg}</div>}

      {/* 1. 対象者を探す */}
      <Card title="① 対象の人を探す">
        {picked ? (
          <div className="flex items-center gap-2.5">
            <Avatar u={picked} />
            <div className="min-w-0">
              <div className="font-black text-[14px] truncate">{picked.displayName}</div>
              <div className="text-[11px] text-muted truncate">
                {[picked.area, picked.age ? `${picked.age}歳` : ''].filter(Boolean).join(' ・ ') || picked.id}
                {picked.mannerPenalty > 0 && <span className="text-red-600 font-bold"> ・ 現在 {picked.mannerPenalty}</span>}
              </div>
            </div>
            <button onClick={() => setPicked(null)} className="ml-auto text-[11px] px-2.5 py-1 rounded-lg bg-bg border border-border font-bold">変更</button>
          </div>
        ) : (
          <>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索（例：たろう）"
              className="w-full border border-border rounded-xl px-3 py-2 text-[13px] bg-bg"
            />
            {loading && <div className="text-[12px] text-muted mt-2">読み込み中…</div>}
            {!loading && q.trim() && matches.length === 0 && <div className="text-[12px] text-muted mt-2">見つかりませんでした</div>}
            <div className="mt-2 flex flex-col gap-1.5">
              {matches.map((u) => (
                <button key={u.id} onClick={() => { setPicked(u); setQ(''); }} className="flex items-center gap-2.5 text-left bg-bg border border-border rounded-xl p-2">
                  <Avatar u={u} />
                  <div className="min-w-0">
                    <div className="font-bold text-[13px] truncate">{u.displayName}{u.isTest && <span className="text-[10px] text-muted font-normal">（テスト）</span>}</div>
                    <div className="text-[10.5px] text-muted truncate">{[u.area, u.age ? `${u.age}歳` : ''].filter(Boolean).join(' ・ ') || u.id}</div>
                  </div>
                  {u.mannerPenalty > 0 && <span className="ml-auto text-[10px] font-black text-red-600 bg-red-50 border border-red-300 rounded-full px-2 py-0.5">{u.mannerPenalty}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* 2. 理由とメモ */}
      <Card title="② 理由を選ぶ">
        <div className="flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <label key={r.v} className={'flex items-center gap-2 text-[12.5px] font-bold rounded-xl px-3 py-2 border ' + (reason === r.v ? 'bg-green-light border-green' : 'bg-bg border-border')}>
              <input type="radio" name="reason" checked={reason === r.v} onChange={() => setReason(r.v)} />
              {r.label}
            </label>
          ))}
        </div>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={3}
          placeholder="メモ（誰からの報告か、どのラウンドか等。任意・運営だけが見ます）"
          className="w-full mt-2.5 border border-border rounded-xl px-3 py-2 text-[12.5px] bg-bg"
        />
      </Card>

      <button
        onClick={apply} disabled={!picked || !!busy}
        className={'w-full mt-1 mb-4 py-3 rounded-2xl font-black text-[14px] ' + (picked && !busy ? 'bg-red-600 text-white' : 'bg-border text-muted')}
      >
        {busy === 'apply' ? '処理中…' : '⚠️ この人の評価を下げる'}
      </button>

      {/* 現在ペナルティがある人 */}
      <Card title={`⚠️ 現在ペナルティがある人（${flagged.length}）`}>
        {flagged.length === 0 ? (
          <div className="text-[12px] text-muted">いません。</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {flagged.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 bg-bg border border-border rounded-xl p-2">
                <Avatar u={u} />
                <div className="min-w-0">
                  <div className="font-bold text-[13px] truncate">{u.displayName}</div>
                  <div className="text-[10.5px] text-muted">{u.mannerPenalty === 1 ? '⚠️ 運営から注意あり' : `🚫 要注意 ×${u.mannerPenalty}`}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 履歴 */}
      <Card title={`🧾 操作の履歴（${logs.length}）`} sub="新しい順。取り消すと評価が元に戻ります。">
        {logs.length === 0 ? (
          <div className="text-[12px] text-muted">まだありません。</div>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((l) => (
              <div key={l.id} className={'border rounded-xl p-2.5 ' + (l.undone ? 'bg-bg border-border opacity-60' : 'bg-card border-border')}>
                <div className="flex items-center gap-2">
                  <span className="font-black text-[13px] truncate">{l.userName || l.userId}</span>
                  <span className={'text-[10px] font-black rounded-full px-2 py-0.5 ' + (l.delta > 0 ? 'text-red-600 bg-red-50 border border-red-300' : 'text-green bg-green-light border border-green')}>
                    {l.delta > 0 ? '評価を下げた' : '戻した'}
                  </span>
                  <span className="ml-auto text-[10.5px] text-muted">{fmt(l.createdAt)}</span>
                </div>
                <div className="text-[11.5px] text-sub mt-1">{reasonJa(l.reason)}</div>
                {l.note && <div className="text-[11.5px] text-text mt-1 whitespace-pre-wrap">{l.note}</div>}
                {l.roundTitle && <div className="text-[10.5px] text-muted mt-1">🏌️ {l.roundTitle}</div>}
                {l.undone ? (
                  <div className="text-[10.5px] text-muted mt-1.5 font-bold">↩️ 取り消し済み</div>
                ) : l.delta > 0 ? (
                  <button onClick={() => undo(l)} disabled={!!busy} className="mt-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-bg border border-border font-bold">↩️ 取り消す</button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="text-[11px] text-muted mt-4 leading-relaxed">
        ※ ここで動かすのは「マナー・信頼度」の指標です。プロフィールの★（また回りたい率）は一緒に回った人どうしの評価から自動計算されるため、運営は直接変更しません。
      </div>
    </div>
  );
}

function Avatar({ u }: { u: U }) {
  if (u.avatarUrl) return <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-none" />;
  return <div className="w-9 h-9 rounded-full bg-border flex-none grid place-items-center text-[13px]">🙂</div>;
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-card p-3.5 mb-3">
      <div className="font-black text-[13px] mb-0.5">{title}</div>
      {sub && <div className="text-[11px] text-muted mb-2">{sub}</div>}
      <div className={sub ? '' : 'mt-2'}>{children}</div>
    </div>
  );
}
