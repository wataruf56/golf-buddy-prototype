'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs';

// 管理画面：友達のつながり（2026-10-13）。1件ずつ「どうやって友達になったか／いまどういう状態か」を種類で出す：
//   📷 QRコードで友達（何時何分・読み取った人）／📨 友達申請で友達（承認）／⏳ 友達申請を送っている（返事待ち）／
//   🙅 お断り／🙂 会ったが友達にならない（10/13〜）／↩️ 取り消し／📷 QR（記録を始める前・時刻なし）。データは /api/admin/friend-requests。
type Kind = 'request_accepted' | 'qr' | 'qr_legacy' | 'request_pending' | 'request_declined' | 'request_cancelled' | 'request_no_friend';
type Item = { kind: Kind; a: string; b: string; at: number; sentAt?: number; claim?: string; accepted?: string; reviewed?: boolean; metAt?: string; message?: string;
  qrAnswers?: Record<string, string | null>; stillFriends?: boolean };
type U = { displayName: string; gender?: string; age?: number };

const KIND: Record<Kind, { label: string; cls: string; group: 'qr' | 'req' | 'pending' | 'ng' }> = {
  qr: { label: '📷 QRコードで友達', cls: 'bg-blue-light text-blue border-blue', group: 'qr' },
  qr_legacy: { label: '📷 QRコードで友達（8/23より前・時刻の記録なし）', cls: 'bg-bg text-blue border-blue', group: 'qr' },
  request_accepted: { label: '📨 友達申請で友達（承認）', cls: 'bg-green-light text-green border-green', group: 'req' },
  request_pending: { label: '⏳ 友達申請を送っている（返事待ち）', cls: 'bg-yellow-light text-[#9A6B12] border-yellow', group: 'pending' },
  request_declined: { label: '🙅 友達申請：お断り（心当たりなし）', cls: 'bg-red-50 text-red border-red', group: 'ng' },
  request_cancelled: { label: '↩️ 友達申請：送った人が取り消し', cls: 'bg-bg text-sub border-border', group: 'ng' },
  // 実際のラベルは kindLabel() で「同じ組・評価済み」などを足して出す
  request_no_friend: { label: '🙂 友達申請：友達にならない', cls: 'bg-orange-light text-orange border-orange', group: 'ng' },
};
const FILTERS: Array<{ k: 'all' | 'qr' | 'req' | 'pending' | 'ng'; label: string }> = [
  { k: 'all', label: 'すべて' }, { k: 'qr', label: '📷 QRで友達' }, { k: 'req', label: '📨 申請で友達' },
  { k: 'pending', label: '⏳ 申請中' }, { k: 'ng', label: '🙅 お断り・友達にならない・取り消し' },
];
const CLAIM: Record<string, string> = { same_group: '同じ組で回った', competition: 'コンペで一緒だった' };
const kindLabel = (it: Item) => {
  if (it.kind !== 'request_no_friend') return KIND[it.kind].label;
  const fact = it.accepted === 'same_group' ? '同じ組' : it.accepted === 'competition' ? 'コンペで一緒' : '';
  return ['🙂 友達申請：' + (fact || '会った'), it.reviewed ? '評価済み' : '', '友達にならない'].filter(Boolean).join('・');
};

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
  const [data, setData] = useState<{ items: Item[]; users: Record<string, U>; friendPairCount: number } | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'qr' | 'req' | 'pending' | 'ng'>('all');
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
    const c: Record<string, number> = { all: 0, qr: 0, req: 0, pending: 0, ng: 0 };
    for (const it of data?.items || []) { c.all++; c[KIND[it.kind].group]++; }
    return c;
  }, [data]);
  const list = useMemo(() => (data?.items || []).filter((it) => (filter === 'all' || KIND[it.kind].group === filter)
    && (!q || nameOf(it.a).includes(q) || nameOf(it.b).includes(q))), [data, filter, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const Name = ({ id }: { id: string }) => (
    <button type="button" onClick={() => setQ(nameOf(id))} className="text-text underline decoration-dotted" title="この人で絞り込む">{who(id)}</button>
  );
  const qrAns = (v?: string | null) => v === 'same_group' ? '同じ組で回った' : v === 'other' ? '同じ組ではない' : 'まだ答えていない';

  return (
    <div className="min-h-screen bg-bg p-4 max-w-[720px] mx-auto">
      <div className="flex items-center justify-between mb-3">
        <Link href={`/admin${token ? `?token=${token}` : ''}`} className="text-blue text-sm font-bold">← 管理</Link>
        <div className="text-[17px] font-black">🤝 友達のつながり</div>
        <button onClick={() => load()} className="text-sm font-bold text-blue">🔄 更新</button>
      </div>
      <AdminTabs token={token} group="trust" current="/admin/friend-requests" />

      <p className="text-[11.5px] text-sub leading-relaxed mt-3 mb-3">
        友達になった組と、送っている友達申請の一覧です（新しい順）。<b className="text-text">QRコードか友達申請か</b>、<b className="text-text">申請中か</b>を色で分けています。
        QRは読み取った時刻（何時何分）を出します。8/23より前のQRは時刻の記録がありません。「読み取った人」は10/13から記録しています。
        お断り・「友達にならない」は申請者には伝わらず「返事待ち」のまま見えています（10/13から、承認されたことも通知していません）。テスト用アカウントは含みません。
      </p>

      {err && <div className="text-red text-sm font-bold mb-3">{err}</div>}
      {!data && !err && <div className="text-sub text-sm py-10 text-center">読み込み中...</div>}

      {data && (
        <>
          <div className="text-[12px] font-bold text-sub mb-2">いま友達になっている組：<b className="text-text">{data.friendPairCount}組</b></div>
          <div className="flex gap-1.5 flex-wrap mb-2.5">
            {FILTERS.map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className={'px-2.5 py-1 rounded-full text-[12px] font-bold border-[1.5px] ' + (filter === f.k ? 'bg-green text-white border-green' : 'bg-card text-sub border-border')}>
                {f.label} {counts[f.k] || 0}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で絞り込み（名前をタップでも）"
            className="w-full mb-3 px-3 py-2 rounded-xl border-[1.5px] border-border bg-card text-sm" />

          {list.length === 0 && <div className="text-sub text-sm py-6 text-center">該当するものはありません</div>}
          <div className="flex flex-col gap-2">
            {list.map((it, i) => {
              const k = KIND[it.kind];
              const isQr = it.kind === 'qr' || it.kind === 'qr_legacy';
              const scannerKnown = it.kind === 'qr' && it.claim !== 'scanner_unknown';
              const responded = it.kind === 'request_accepted' || it.kind === 'request_no_friend';
              const corrected = responded && it.accepted && it.accepted !== it.claim;
              return (
                <div key={`${it.kind}-${it.a}-${it.b}-${i}`} className="bg-card rounded-card shadow-card p-3">
                  <span className={'inline-block text-[10.5px] font-black px-2 py-0.5 rounded-full border mb-1.5 ' + k.cls}>{kindLabel(it)}</span>
                  <div className="flex items-center gap-1.5 flex-wrap text-[13.5px] font-black">
                    <Name id={it.a} />
                    <span className="text-muted">{isQr && !scannerKnown ? '⇄' : '→'}</span>
                    <Name id={it.b} />
                  </div>
                  {isQr ? (
                    <div className="text-[12px] text-sub mt-1.5 leading-relaxed">
                      {it.kind === 'qr'
                        ? <>友達になった時刻：<b className="text-text">{fmt(it.at)}</b>{scannerKnown ? <>（<b className="text-text">{nameOf(it.a)}</b>が読み取り）</> : ''}</>
                        : <>友達になった時刻：記録なし（QRの時刻を残し始めた 8/23 より前）</>}
                      {it.qrAnswers && (
                        <div className="mt-0.5">同じ組だったか：{Object.entries(it.qrAnswers).map(([uid, v], j) => (
                          <span key={uid}>{j ? ' ／ ' : ''}{nameOf(uid)}「<b className="text-text">{qrAns(v)}</b>」</span>
                        ))}</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="text-[12px] text-sub mt-1.5 leading-relaxed">
                        申告：<b className="text-text">{CLAIM[it.claim || ''] || it.claim}</b>{it.metAt ? `（${it.metAt}）` : ''}
                        {responded && it.accepted && (
                          <> ／ 受け手の確定：<b className={corrected ? 'text-orange' : 'text-text'}>{CLAIM[it.accepted]}</b>{corrected && <span className="text-orange font-bold">（訂正あり）</span>}</>
                        )}
                        {responded && it.reviewed && <> ／ 受け手は<b className="text-text">評価済み</b></>}
                      </div>
                      {it.message && <div className="text-[12px] mt-1 px-2.5 py-1.5 rounded-lg bg-bg whitespace-pre-wrap">💬 {it.message}</div>}
                      <div className="text-[10.5px] text-muted mt-1.5">
                        送信 {fmt(it.sentAt)}{it.kind !== 'request_pending' && it.at && it.at !== it.sentAt ? ` ・ 返事 ${fmt(it.at)}` : ''}
                      </div>
                    </>
                  )}
                  {(it.kind === 'request_accepted' || it.kind === 'qr') && it.stillFriends === false && (
                    <div className="text-[10.5px] text-red font-bold mt-1">※ いまは友達リストに入っていません（解除・退会など）</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
