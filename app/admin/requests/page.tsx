'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminTabs } from '@/components/AdminTabs';
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea';
import { Linkify } from '@/components/Linkify';
import { appProfileUrl } from '@/lib/adminLinks';
import {
  FEATURE_REQUEST_ADMIN_SENDER, FEATURE_REQUEST_CATEGORY_LABEL, FEATURE_REQUEST_STATUSES, FEATURE_REQUEST_STATUS_META,
  type FeatureRequestItem, type FeatureRequestMessage, type FeatureRequestStatus,
} from '@/lib/featureRequests';

// 管理画面：💡 改修要望（2026-10-13）。会員が /requests から出した要望のスレッドを、状態で絞って開き、
// 「🛡️ ゴルトモ運営」として返信・状態の変更・ピン留めをする。
type AdminItem = FeatureRequestItem & { isTest?: boolean; adminUnread?: boolean };

export default function AdminRequestsPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const idFromUrl = search?.get('id') || '';
  const [token, setToken] = useState('');
  const [items, setItems] = useState<AdminItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<'' | FeatureRequestStatus>('');
  const [active, setActive] = useState<string>('');
  const [item, setItem] = useState<AdminItem | null>(null);
  const [messages, setMessages] = useState<FeatureRequestMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [patching, setPatching] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

  async function loadList(t = token, f = filter) {
    if (!t) return;
    try {
      const r = await fetch(`/api/admin/requests?token=${encodeURIComponent(t)}${f ? `&status=${f}` : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setItems(j.items || []); setCounts(j.counts || {}); }
    } catch {}
  }
  async function openThread(id: string, t = token) {
    setActive(id);
    try {
      const r = await fetch(`/api/admin/requests?token=${encodeURIComponent(t)}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setItem(j.item || null); setMessages(j.messages || []); }
    } catch {}
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }
  useEffect(() => { if (token) { loadList(token, filter); if (idFromUrl && !active) openThread(idFromUrl, token); } /* eslint-disable-next-line */ }, [token, filter]);

  async function send() {
    const t = text.trim();
    if (!t || !active || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/requests?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: active, text: t }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setText('');
      await openThread(active);
      await loadList();
    } catch (e) { alert('送信失敗: ' + (e as Error).message); }
    finally { setSending(false); }
  }

  async function patch(body: { status?: FeatureRequestStatus; pinned?: boolean }) {
    if (!active || patching) return;
    setPatching(true);
    try {
      const r = await fetch(`/api/admin/requests?token=${encodeURIComponent(token)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: active, ...body }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(`${r.status}`);
      await openThread(active);
      await loadList();
    } catch (e) { alert('更新失敗: ' + (e as Error).message); }
    finally { setPatching(false); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-24">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">💡 改修要望</div>
      <div className="text-[12px] text-muted mb-3">会員が「ゴル友」タブ →「💡 改修要望」から出した要望。ここから「🛡️ ゴルトモ運営」として返信・状態の変更ができます（返信は本人にアプリ内＋LINEで届く。会員は全スレッドを読める）。</div>
      <AdminTabs token={token} group="trust" current="/admin/requests" />

      {!active ? (
        <>
          <div className="flex gap-1 flex-wrap mb-3">
            <FilterChip on={filter === ''} onClick={() => setFilter('')} label={`すべて ${total}`} />
            {FEATURE_REQUEST_STATUSES.map((s) => (
              <FilterChip key={s} on={filter === s} onClick={() => setFilter(s)} label={`${FEATURE_REQUEST_STATUS_META[s].label} ${counts[s] || 0}`} />
            ))}
          </div>
          {items.length === 0 ? (
            <div className="text-center text-[12px] text-muted py-10">要望はありません</div>
          ) : (
            items.map((it) => {
              const st = FEATURE_REQUEST_STATUS_META[it.status] || FEATURE_REQUEST_STATUS_META.new;
              return (
                <button key={it.id} onClick={() => openThread(it.id)} className="w-full text-left bg-card rounded-xl shadow-card p-3 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    {it.adminUnread && <span className="w-2 h-2 rounded-full bg-orange inline-block" aria-label="未読" />}
                    {it.pinned && <span className="text-[10px] font-black px-1.5 py-px rounded-full border text-orange bg-orange-light border-orange">📌</span>}
                    <span className={`text-[10px] font-black px-1.5 py-px rounded-full border ${st.className}`}>{st.label}</span>
                    <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-bg text-sub border border-border">{FEATURE_REQUEST_CATEGORY_LABEL[it.category] || 'その他'}</span>
                    {it.isTest && <span className="text-[10px] font-black px-1.5 py-px rounded-full border text-purple-600 bg-purple-100 border-purple-600">🧪 テスト垢</span>}
                  </div>
                  <div className="text-[14px] font-black leading-snug">{it.title}</div>
                  <div className="text-[11px] text-muted mt-1 truncate">{it.author.avatar} {it.author.displayName} ・ 💬 {it.replyCount} ・ 👍 {it.voteCount} ・ {fmt(it.lastMessageAt || it.createdAt)}</div>
                  {it.lastMessage && <div className="text-[11.5px] text-sub mt-1 truncate">{it.lastSenderId === FEATURE_REQUEST_ADMIN_SENDER ? '🛡️ ' : ''}{it.lastMessage}</div>}
                </button>
              );
            })
          )}
        </>
      ) : (
        <>
          <button onClick={() => { setActive(''); setItem(null); setMessages([]); loadList(); }} className="text-[12px] text-muted mb-2">‹ 一覧へ</button>
          {!item ? <div className="text-[12px] text-muted py-6">読み込み中…</div> : (
            <>
              <div className="bg-card rounded-xl shadow-card p-3 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`text-[10px] font-black px-1.5 py-px rounded-full border ${(FEATURE_REQUEST_STATUS_META[item.status] || FEATURE_REQUEST_STATUS_META.new).className}`}>{(FEATURE_REQUEST_STATUS_META[item.status] || FEATURE_REQUEST_STATUS_META.new).label}</span>
                  <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-bg text-sub border border-border">{FEATURE_REQUEST_CATEGORY_LABEL[item.category] || 'その他'}</span>
                  {item.isTest && <span className="text-[10px] font-black px-1.5 py-px rounded-full border text-purple-600 bg-purple-100 border-purple-600">🧪 テスト垢</span>}
                  <span className="ml-auto text-[10px] text-muted">👍 {item.voteCount}</span>
                </div>
                <div className="text-[15px] font-black leading-snug">{item.title}</div>
                <div className="text-[11px] text-muted mt-1">
                  <a href={appProfileUrl(item.authorId)} target="_blank" rel="noreferrer" className="underline">{item.author.avatar} {item.author.displayName}</a> ・ {fmt(item.createdAt)}
                </div>
                <div className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words"><Linkify text={item.body} /></div>
              </div>

              {/* 状態・ピン留め */}
              <div className="bg-card rounded-xl shadow-card p-3 mb-3">
                <div className="text-[11px] font-black text-muted mb-1.5">状態を変える（本人にアプリ内お知らせ）</div>
                <div className="flex gap-1 flex-wrap">
                  {FEATURE_REQUEST_STATUSES.map((s) => (
                    <button key={s} disabled={patching || item.status === s} onClick={() => patch({ status: s })}
                      title={FEATURE_REQUEST_STATUS_META[s].desc}
                      className={'px-2.5 py-1.5 rounded-full text-[11px] font-black border-[1.5px] disabled:opacity-60 ' + (item.status === s ? 'bg-green text-white border-green' : 'bg-bg text-sub border-border')}>
                      {FEATURE_REQUEST_STATUS_META[s].label}
                    </button>
                  ))}
                </div>
                <button disabled={patching} onClick={() => patch({ pinned: !item.pinned })}
                  className="mt-2 px-2.5 py-1.5 rounded-full text-[11px] font-black border-[1.5px] bg-bg border-border text-sub disabled:opacity-60">
                  {item.pinned ? '📌 ピン留めを外す' : '📌 一覧の先頭にピン留め'}
                </button>
              </div>

              {/* やり取り */}
              <div className="mb-3">
                {messages.length <= 1 && <div className="text-center text-[11px] text-muted py-3">まだ返信はありません</div>}
                {messages.slice(1).map((m) => {
                  const admin = m.senderId === FEATURE_REQUEST_ADMIN_SENDER;
                  return (
                    <div key={m.id} className={'flex mb-2 ' + (admin ? 'justify-end' : 'justify-start')}>
                      <div className="max-w-[85%]">
                        <div className={'text-[10px] font-black mb-0.5 ' + (admin ? 'text-green text-right' : 'text-muted')}>{admin ? '🛡️ ゴルトモ運営' : item.author.displayName}</div>
                        <div className={'rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words border ' + (admin ? 'bg-green-light border-green' : 'bg-card border-border')}>
                          <Linkify text={m.text} />
                        </div>
                        <div className={'text-[10px] text-muted mt-0.5 ' + (admin ? 'text-right' : '')}>{fmt(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <div className="flex items-end gap-2">
                <AutoGrowTextarea value={text} onChange={(e) => setText(e.target.value)} placeholder="🛡️ ゴルトモ運営として返信（本人にアプリ内＋LINE）"
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-[13px] leading-relaxed resize-none" />
                <button onClick={send} disabled={sending || !text.trim()} className="px-4 py-2 rounded-xl bg-green text-white text-[12px] font-black disabled:opacity-50">送る</button>
              </div>
              <div className="text-[10.5px] text-muted mt-1.5">「受付」のまま返信すると自動で「検討中」になります。</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={'px-2.5 py-1 rounded-full text-[11px] font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-card text-sub border-border')}>{label}</button>
  );
}

function fmt(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
