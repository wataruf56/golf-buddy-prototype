'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminTabs } from '@/components/AdminTabs';
import { useSearchParams } from 'next/navigation';

type Thread = {
  chatId: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
  lastMessage: string;
  lastMessageAt: number;
};
type Msg = { senderId: string; senderName: string; text: string; imageUrl: string; createdAt: number };

function jst(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminDmPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  // 他の管理画面と同じ取得パターンに揃える。URLに ?token= が無くても
  // localStorage と /api/admin/init から拾えるようにしておかないと、
  // この画面だけ直接開けず「トークンが必要です」で止まってしまう。
  const [token, setToken] = useState('');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
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
      } catch {}
    })();
  }, [tokenFromUrl]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/admin/dm?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setThreads(Array.isArray(d.threads) ? d.threads : []))
      .catch(() => setThreads([]))
      .finally(() => setLoading(false));
  }, [token]);

  function openThread(t: Thread) {
    setActive(t);
    setMessages([]);
    setMsgLoading(true);
    fetch(`/api/admin/dm?token=${encodeURIComponent(token)}&chatId=${encodeURIComponent(t.chatId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMessages(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));
  }

  const filtered = threads.filter((t) =>
    !q.trim() || `${t.a.name} ${t.b.name} ${t.lastMessage}`.toLowerCase().includes(q.trim().toLowerCase()));

  // トークンは /api/admin/init から非同期で入るので、それまでは読み込み中を出す。
  if (!token) return <div className="p-6 text-sub text-sm">⚙️ 読み込み中...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 pb-20">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/admin?token=${encodeURIComponent(token)}`} className="text-sm text-blue font-semibold">← 管理トップ</Link>
      </div>
        <AdminTabs token={token} group="messages" current="/admin/dm" />
      <h1 className="text-xl font-black mb-1">💬 DMログ</h1>
      <p className="text-[12px] text-sub mb-3">1対1のダイレクトメッセージ。誰が誰に送ったか（直近順）。行をタップすると本文を表示します。<b className="text-red">個人間のやり取りです。取り扱いに注意。</b></p>

      {active ? (
        <div>
          <button onClick={() => setActive(null)} className="text-sm text-blue font-semibold mb-2">← 一覧に戻る</button>
          <div className="text-[13px] font-black mb-2">{active.a.name} ↔ {active.b.name}</div>
          {msgLoading ? (
            <div className="text-sub text-sm p-4">読み込み中...</div>
          ) : messages.length === 0 ? (
            <div className="text-sub text-sm p-4">メッセージがありません。</div>
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => (
                <div key={i} className="p-2.5 bg-bg rounded-lg">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[12px] font-bold text-text">{m.senderName}</span>
                    <span className="text-[10px] text-muted">{jst(m.createdAt)}</span>
                  </div>
                  {m.text && <div className="text-[13px] whitespace-pre-wrap break-words">{m.text}</div>}
                  {m.imageUrl && <div className="text-[12px] text-sub mt-0.5">📷 画像</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="名前・本文で絞り込み"
            className="w-full p-2.5 mb-3 border-[1.5px] border-border rounded-lg text-sm bg-bg outline-none"
          />
          {loading ? (
            <div className="text-sub text-sm p-4">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sub text-sm p-4">DMスレッドがありません。</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map((t) => (
                <button key={t.chatId} onClick={() => openThread(t)}
                  className="text-left p-3 bg-card border border-border rounded-lg hover:bg-bg">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-text truncate">{t.a.name} <span className="text-muted font-normal">↔</span> {t.b.name}</span>
                    <span className="text-[10px] text-muted flex-shrink-0 ml-2">{jst(t.lastMessageAt)}</span>
                  </div>
                  {t.lastMessage && <div className="text-[12px] text-sub truncate mt-0.5">{t.lastMessage}</div>}
                </button>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted mt-3">直近{threads.length}スレッド</div>
        </div>
      )}
    </div>
  );
}
