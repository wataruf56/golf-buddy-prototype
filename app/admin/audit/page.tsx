'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { appProfileUrl } from '@/lib/adminLinks';

// 操作ログ。「誰が・誰に・何をしたか」を1件1行で見る。
//
// 人が押した操作と、自動で動いたもの（再会エンジン）を**同じ台帳**に並べる。
// 受け取ったユーザーから見れば、どちらも「運営から何かされた」ことに変わりはない。
type Row = {
  ts: number;
  action: string;
  actorKind: 'admin' | 'token' | 'system' | 'user';
  actorId: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  targetKind?: string;
  summary: string;
  detail?: Record<string, unknown>;
  ip?: string;
  ua?: string;
};

const ACTION_LABEL: Record<string, string> = {
  'user.delete': '🗑 会員の削除',
  'user.ban': '⛔ 利用停止',
  'user.unban': '✅ 停止の解除',
  'user.restrict': '🚫 機能の制限',
  'user.swing_allow': '📊 スイング解析の許可',
  'user.support_send': '🛡️ 管理人からの送信',
  'user.push_test': '🔔 テスト通知',
  'broadcast.send': '📣 一斉配信',
  'broadcast.review_blast': '📝 レビュー依頼の一斉送信',
  'round.delete': '🗑 募集の削除',
  'official.create': '📣 運営枠を立てた',
  'official.close': '📣 運営枠を閉じた',
  'official.delete': '📣 運営枠を削除',
  'config.save': '⚙️ 設定の変更',
  'data.reset_test': '🧹 テストデータの削除',
  'rematch.notify': '🔁 再会の通知',
  'rematch.run': '🔁 再会エンジンを手動実行',
  'rematch.reset': '🔁 再会データの削除',
  'group.join': '🚪 グループに入った',
  'group.leave': '🚪 グループを抜けた',
};
const al = (k: string) => ACTION_LABEL[k] || k;

const ACTOR_LABEL: Record<Row['actorKind'], string> = {
  admin: '👤 管理者',
  token: '🔑 管理トークン',
  system: '🤖 自動',
  user: '🙋 会員本人',
};

const fmt = (ms: number) =>
  new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Page() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const [token, setToken] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [days, setDays] = useState(30);
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');   // 「この人に何をしたか」
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const cached = search?.get('token') || localStorage.getItem('gb_admin_token') || '';
    if (cached) setToken(cached);
    (async () => {
      try {
        const r = await fetch('/api/admin/init', { cache: 'no-store' });
        const j = await r.json();
        if (j?.token) { localStorage.setItem('gb_admin_token', j.token); setToken(j.token); }
      } catch { /* noop */ }
    })();
    const t = search?.get('targetId');
    if (t) setTarget(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ token, days: String(days), limit: '300' });
      if (action) q.set('action', action);
      if (target) q.set('targetId', target);
      const r = await fetch(`/api/admin/audit?${q}`, { cache: 'no-store' });
      const text = await r.text();
      let j: any;
      try { j = JSON.parse(text); } catch { throw new Error(`${r.status} ${text.slice(0, 60)}`); }
      if (j.error) throw new Error(j.error);
      setRows(j.rows || []);
      setActions(j.actions || []);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [token, days, action, target]);
  useEffect(() => { load(); }, [load]);

  if (!token) return <div className="min-h-screen bg-bg p-5 text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto">
      <Link href={`/admin?token=${token}`} className="text-[12px] text-blue font-bold">‹ 管理</Link>
      <div className="text-2xl font-black mt-1 mb-1">📒 操作ログ</div>
      <div className="text-[11.5px] text-sub font-bold leading-relaxed mb-3">
        誰が・誰に・何をしたかの台帳です。<b className="text-text">自動で動く再会エンジンの送信も同じ場所に残ります。</b>
        <Link href={`/admin/group-log?token=${token}`} className="text-blue underline ml-1">
          グループの入退室だけ見る ›
        </Link>
      </div>

      {/* しぼり込み */}
      <div className="bg-card rounded-xl shadow-card p-3 mb-3">
        <div className="flex gap-2 mb-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={'flex-1 py-2 rounded-lg text-[12px] font-black border-2 ' +
                (days === d ? 'border-green bg-green-light' : 'border-border bg-white')}>
              {d}日
            </button>
          ))}
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="w-full border-2 border-border rounded-lg px-2 py-2 text-[12.5px] font-bold bg-white">
          <option value="">すべての操作</option>
          {actions.map((a) => <option key={a} value={a}>{al(a)}</option>)}
        </select>
        <div className="flex gap-2 mt-2">
          <input value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="この人に何をしたか（会員IDを貼る）"
            className="flex-1 min-w-0 border-2 border-border rounded-lg px-2 py-2 text-[12px] font-bold bg-white" />
          {!!target && (
            <button onClick={() => setTarget('')}
              className="px-3 rounded-lg text-[12px] font-black border-2 border-border bg-white">解除</button>
          )}
        </div>
      </div>

      {err && <div className="text-[12px] font-black text-red mb-2">❌ {err}</div>}
      {loading && <div className="text-[12px] text-muted mb-2">読み込み中...</div>}
      {!loading && rows.length === 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 text-[12.5px] leading-relaxed">
          この条件の記録はありません。<br />
          <span className="text-muted">操作ログは記録を入れた日から貯まります。それ以前の操作は残っていません。</span>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={`${r.ts}-${i}`} className="bg-card rounded-xl shadow-card p-3">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className={'text-[10.5px] font-black border rounded-full px-2 py-0.5 ' +
                (r.actorKind === 'system' ? 'bg-blue-light border-blue text-blue'
                  : r.actorKind === 'admin' ? 'bg-green-light border-green text-green'
                  : r.actorKind === 'user' ? 'bg-bg border-border text-sub'
                  : 'bg-yellow-light border-yellow text-orange')}>
                {ACTOR_LABEL[r.actorKind]}{r.actorName ? ` ${r.actorName}` : ''}
              </span>
              <span className="text-[10.5px] font-bold text-muted">{al(r.action)}</span>
              <span className="text-[10.5px] font-bold text-muted ml-auto">{fmt(r.ts)}</span>
            </div>
            <div className="text-[13px] font-bold leading-relaxed">{r.summary}</div>
            <div className="flex items-center gap-2 mt-1.5">
              {r.targetId && r.targetKind === 'user' && (
                <>
                  <a href={appProfileUrl(r.targetId)} className="text-[11px] font-black text-blue underline">
                    相手のプロフィール
                  </a>
                  <button onClick={() => setTarget(r.targetId!)}
                    className="text-[11px] font-black text-blue underline">この人の履歴だけ見る</button>
                </>
              )}
              {!!r.detail && (
                <button onClick={() => setOpen(open === i ? null : i)}
                  className="text-[11px] font-black text-muted underline ml-auto">
                  {open === i ? '詳細を閉じる' : '詳細'}
                </button>
              )}
            </div>
            {open === i && (
              <pre className="mt-2 bg-bg border border-hair rounded-lg p-2 text-[10.5px] leading-relaxed whitespace-pre-wrap break-all">
                {JSON.stringify({ ...r.detail, 会員ID: r.targetId, IP: r.ip, 端末: r.ua }, null, 1)}
              </pre>
            )}
          </div>
        ))}
      </div>
      <div className="h-8" />
    </div>
  );
}
