'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type ChatRow = { userId: string; displayName: string; avatar: string; avatarUrl: string; lastMessage: string; lastMessageAt: number; unread: number };
type Msg = { id: string; senderId: string; text: string; imageUrl?: string; createdAt: number };

export default function AdminSupportPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}

function Inner() {
  const search = useSearchParams();
  const tokenFromUrl = search?.get('token') || '';
  const userIdFromUrl = search?.get('userId') || '';
  const [token, setToken] = useState('');
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [active, setActive] = useState<string>('');
  const [activeName, setActiveName] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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

  async function loadList(t = token) {
    if (!t) return;
    try {
      const r = await fetch(`/api/admin/support-chat?token=${encodeURIComponent(t)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) setChats(j.chats || []);
    } catch {}
  }
  async function openChat(userId: string, name?: string, t = token) {
    setActive(userId);
    if (name) setActiveName(name);
    try {
      const r = await fetch(`/api/admin/support-chat?token=${encodeURIComponent(t)}&userId=${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok) { setMessages(j.messages || []); if (j.user?.displayName) setActiveName(j.user.displayName); }
    } catch {}
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }
  useEffect(() => { if (token) { loadList(token); if (userIdFromUrl) openChat(userIdFromUrl, '', token); } /* eslint-disable-next-line */ }, [token]);

  async function send() {
    const t = text.trim();
    if (!t || !active || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/admin/support-chat?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: active, text: t }), cache: 'no-store',
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setText('');
      await openChat(active);
      await loadList();
    } catch (e) { alert('送信失敗: ' + (e as Error).message); }
    finally { setSending(false); }
  }

  if (!token) return <div className="min-h-screen bg-bg p-5 max-w-md mx-auto flex items-center justify-center text-sm text-muted">⚙️ 読み込み中...</div>;

  return (
    <div className="min-h-screen bg-bg p-4 max-w-md mx-auto pb-24">
      <Link href={`/admin?token=${token}`} className="text-muted text-sm">‹ 管理</Link>
      <div className="text-2xl font-black mb-1 mt-1">🛡️ 管理人チャット</div>
      <div className="text-[12px] text-muted mb-3">通報者やユーザーと「管理人」名義でDMできます。ユーザー側は「ゴル友」に管理人が表示されます。</div>

      {!active ? (
        <>
          <button onClick={() => loadList()} className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs font-bold mb-3">🔄 更新</button>
          {chats.length === 0 ? (
            <div className="text-center text-sm text-muted py-10">まだ会話はありません。通報一覧の「通報者とチャット」から開始できます。</div>
          ) : (
            <div className="flex flex-col gap-2">
              {chats.map((c) => (
                <button key={c.userId} onClick={() => openChat(c.userId, c.displayName)} className="flex items-center gap-3 p-3 bg-card rounded-xl shadow-card text-left">
                  <div className="w-10 h-10 rounded-full bg-bg overflow-hidden flex items-center justify-center text-lg flex-shrink-0">
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" /> : (c.avatar || '⛳')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{c.displayName}</div>
                    <div className="text-[11px] text-muted truncate">{c.lastMessage || '（メッセージなし）'}</div>
                  </div>
                  {c.unread > 0 && <span className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full">{c.unread}</span>}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => { setActive(''); loadList(); }} className="text-blue text-sm font-semibold">‹ 一覧</button>
            <span className="text-sm font-black">{activeName || active.slice(0, 10)}</span>
            <Link href={`/profile/${active}`} className="text-[11px] text-blue underline ml-auto">プロフィール</Link>
          </div>
          <div className="bg-card rounded-xl shadow-card p-3 mb-2 min-h-[320px] max-h-[55vh] overflow-y-auto flex flex-col gap-2">
            {messages.length === 0 ? (
              <div className="text-center text-[12px] text-muted py-10">まだメッセージはありません。下から送信してください。</div>
            ) : messages.map((m) => {
              const fromAdmin = m.senderId === 'admin_manager';
              return (
                <div key={m.id} className={'max-w-[80%] px-3 py-2 rounded-2xl text-[13px] ' + (fromAdmin ? 'self-end bg-green text-white' : 'self-start bg-bg text-text')}>
                  {m.text}
                  <div className={'text-[9px] mt-0.5 ' + (fromAdmin ? 'text-white/70' : 'text-muted')}>{m.createdAt ? new Date(m.createdAt).toLocaleString('ja-JP') : ''}</div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} placeholder="管理人としてメッセージを送信" className="flex-1 h-14 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-card outline-none resize-none" />
            <button onClick={send} disabled={sending || !text.trim()} className="px-4 bg-green text-white rounded-[10px] text-sm font-black disabled:opacity-50">{sending ? '…' : '送信'}</button>
          </div>
        </>
      )}
    </div>
  );
}
