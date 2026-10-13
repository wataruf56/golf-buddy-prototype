'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs';

// 管理画面：友達申請の一覧（2026-10-13）。誰が誰に送ったか・どうなったか（返事待ち／承認／お断り／取り消し）。
// 申請の中身（どこで一緒だったか・いつ・ひとこと）と、受け手が確定させた事実（訂正があればそれも）を出す。
// 下に「QRで友達」になった組（同じ組だったかの答え）も。データは /api/admin/friend-requests。
type Req = { id: string; fromId: string; toId: string; claim: 'same_group' | 'competition'; metAt?: string; message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'; accepted?: 'same_group' | 'competition'; createdAt?: number; respondedAt?: number };
type Qr = { id: string; userId: string; otherId: string; linkedAt?: number; answer?: 'same_group' | 'other'; answeredAt?: number };
type U = { displayName: string; avatarUrl?: string; gender?: string; age?: number };

const STATUS: Record<Req['status'], { label: string; cls: string }> = {
  pending: { label: '⏳ 返事待ち', cls: 'bg-yellow-light text-[#9A6B12] border-yellow' },
  accepted: { label: '✅ 承認（友達になった）', cls: 'bg-green-light text-green border-green' },
  declined: { label: '🙅 お断り（心当たりなし）', cls: 'bg-red-50 text-red border-red' },
  cancelled: { label: '↩️ 申請者が取り消し', cls: 'bg-bg text-sub border-border' },
};
const CLAIM: Record<string, string> = { same_group: '同じ組で回った', competition: 'コンペで一緒だった' };

const fmt = (ms?: number) => {
  if (!ms) return '';
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AdminFriendRequestsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const [token, setToken] = useState('');
  const [data, setData] = useState<{ requests: Req[]; qr: Qr[]; users: Record<string, U> } | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | Req['status']>('all');
  const [q, setQ] = useState('');

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
      } catch { /* noop */ }
    })();
  }, [tokenFromUrl]);

  async function load(t = token) {
    if (!t) return;
    setErr('');
    try {
      const r = await fetch(`/api/admin/friend-requests?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
    } catch (e) { setErr('読み込めませんでした（' + (e as Error).message + '）'); }
  }
  useEffect(() => { load(token); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const nameOf = (id: string) => data?.users[id]?.displayName || '（不明）';
  const who = (id: string) => {
    const u = data?.users[id];
    const g = u?.gender === 'male' ? '👨' : u?.gender === 'female' ? '👩' : '';
    return `${u?.displayName || '（不明）'}${g ? ' ' + g : ''}${u?.age ? ` ${u.age}歳` : ''}`;
  };
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, pending: 0, accepted: 0, declined: 0, cancelled: 0 };
    for (const r of data?.requests || []) { c.all++; c[r.status] = (c[r.status] || 0) + 1; }
    return c;
  }, [data]);
  const list = useMemo(() => (data?.requests || []).filter((r) => (filter === 'all' || r.status === filter)
    && (!q || nameOf(r.fromId).includes(q) || nameOf(r.toId).includes(q))), [data, filter, q]); // eslint-disable-line react-hooks/exhaustive-deps

  // QR は1組につき両方向の2件 → 組ごとにまとめる
  const qrPairs = useMemo(() => {
    const m = new Map<string, Qr[]>();
    for (const x of data?.qr || []) { const k = [x.userId, x.otherId].sort().join('|'); m.set(k, [...(m.get(k) || []), x]); }
    return Array.from(m.values()).filter((xs) => !q || xs.some((x) => nameOf(x.userId).includes(q) || nameOf(x.otherId).includes(q)));
  }, [data, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-bg p-4 max-w-[720px] mx-auto">
      <div className="flex items-center justify-between mb-3">
        <Link href={`/admin${token ? `?token=${token}` : ''}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="text-[17px] font-black">🤝 友達申請</div>
        <button onClick={() => load()} className="text-sm font-bold text-blue">🔄 更新</button>
      </div>
      <AdminTabs token={token} group="trust" current="/admin/friend-requests" />

      <p className="text-[11.5px] text-sub leading-relaxed mt-3 mb-3">
        相手のプロフィールから送る「友達申請」の一覧です（新しい順）。<b className="text-text">誰が誰に</b>、<b className="text-text">どこで一緒だったと申告したか</b>、<b className="text-text">結果</b>が見られます。
        お断りされたことは申請者には伝わらず「返事待ち」のまま見えています。テスト用アカウントは含みません。
      </p>

      {err && <div className="text-red text-sm font-bold mb-3">{err}</div>}
      {!data && !err && <div className="text-sub text-sm py-10 text-center">読み込み中...</div>}

      {data && (
        <>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {(['all', 'pending', 'accepted', 'declined', 'cancelled'] as const).map((k) => (
              <button key={k} onClick={() => setFilter(k)}
                className={'px-2.5 py-1 rounded-full text-[12px] font-bold border-[1.5px] ' + (filter === k ? 'bg-green text-white border-green' : 'bg-card text-sub border-border')}>
                {k === 'all' ? 'すべて' : STATUS[k].label} {counts[k] || 0}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で絞り込み（名前をタップでも）"
            className="w-full mb-3 px-3 py-2 rounded-xl border-[1.5px] border-border bg-card text-sm" />

          {list.length === 0 && <div className="text-sub text-sm py-6 text-center">該当する申請はありません</div>}
          <div className="flex flex-col gap-2">
            {list.map((r) => {
              const st = STATUS[r.status] || STATUS.pending;
              const corrected = r.status === 'accepted' && r.accepted && r.accepted !== r.claim;
              return (
                <div key={r.id} className="bg-card rounded-card shadow-card p-3">
                  <div className="flex items-center gap-1.5 flex-wrap text-[13.5px] font-black">
                    <button type="button" onClick={() => setQ(nameOf(r.fromId))} className="text-text underline decoration-dotted" title="この人で絞り込む">{who(r.fromId)}</button>
                    <span className="text-muted">→</span>
                    <button type="button" onClick={() => setQ(nameOf(r.toId))} className="text-text underline decoration-dotted" title="この人で絞り込む">{who(r.toId)}</button>
                    <span className={'ml-auto text-[10.5px] font-black px-2 py-0.5 rounded-full border ' + st.cls}>{st.label}</span>
                  </div>
                  <div className="text-[12px] text-sub mt-1.5 leading-relaxed">
                    申告：<b className="text-text">{CLAIM[r.claim] || r.claim}</b>{r.metAt ? `（${r.metAt}）` : ''}
                    {r.status === 'accepted' && r.accepted && (
                      <> ／ 受け手の確定：<b className={corrected ? 'text-orange' : 'text-text'}>{CLAIM[r.accepted]}</b>{corrected && <span className="text-orange font-bold">（訂正あり）</span>}</>
                    )}
                  </div>
                  {r.message && <div className="text-[12px] mt-1 px-2.5 py-1.5 rounded-lg bg-bg whitespace-pre-wrap">💬 {r.message}</div>}
                  <div className="text-[10.5px] text-muted mt-1.5">送信 {fmt(r.createdAt)}{r.respondedAt ? ` ・ 返事 ${fmt(r.respondedAt)}` : ''}</div>
                </div>
              );
            })}
          </div>

          <div className="text-[15px] font-black mt-7 mb-1">📷 QRで友達になった組（{qrPairs.length}組）</div>
          <p className="text-[11px] text-sub mb-2.5">QRを読み取った時点で友達になります。そのあと、それぞれが「同じ組で回ったか」を答えます。</p>
          <div className="flex flex-col gap-2">
            {qrPairs.map((xs) => {
              const a = xs[0];
              const ans = (x?: Qr) => !x ? '—' : x.answer === 'same_group' ? '同じ組で回った' : x.answer === 'other' ? '同じ組ではない' : 'まだ答えていない';
              const b = xs.find((x) => x.userId === a.otherId);
              return (
                <div key={a.id} className="bg-card rounded-card shadow-card p-3">
                  <div className="text-[13.5px] font-black">{who(a.userId)} <span className="text-muted">⇄</span> {who(a.otherId)}</div>
                  <div className="text-[12px] text-sub mt-1 leading-relaxed">
                    {nameOf(a.userId)}の答え：<b className="text-text">{ans(a)}</b> ／ {nameOf(a.otherId)}の答え：<b className="text-text">{ans(b)}</b>
                  </div>
                  <div className="text-[10.5px] text-muted mt-1">友達になった {fmt(a.linkedAt)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
