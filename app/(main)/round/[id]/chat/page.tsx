'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore, store } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { markRoundChatSeen } from '@/lib/useUnread';
import type { Message, Round, RoundThread } from '@/lib/types';

// Branded launch URL (handled in middleware → LIFF). Lets us share a friendly
// goltomo.com/app link that deep-links to this group chat after login.
const SHARE_BASE = 'https://goltomo.com/app';

export default function RoundChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const users = useStore((s) => s.users);
  const [fetchedRound, setFetchedRound] = useState<Round | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<RoundThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null); // null = main chat
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const round = storeRound || fetchedRound;

  async function load() {
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, { cache: 'no-store' });
      if (res.status === 403) { setDenied(true); setLoaded(true); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setMessages(d.messages || []);
      setThreads(d.threads || []);
      if (d.round) setFetchedRound(d.round);
      setDenied(false);
      setLoaded(true);
    } catch { /* silent (keep last good state) */ }
  }

  async function shareChat() {
    const url = `${SHARE_BASE}?to=${encodeURIComponent(`/round/${params.id}/chat`)}`;
    const text = `💬 ${round?.title || 'ラウンド'} のグループチャット`;
    const w = window as any;
    if (w.navigator?.share) {
      try { await w.navigator.share({ title: 'ゴルトモ グループチャット', text, url }); return; } catch { /* fall through */ }
    }
    try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
    catch { window.prompt('このリンクをコピーして共有してください', url); }
  }

  useEffect(() => {
    if (!params.id) return;
    load();
    markRoundChatSeen(params.id);
    const interval = setInterval(() => { load(); markRoundChatSeen(params.id); }, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  // Messages for the current view (main = no threadId; thread = matching threadId).
  const shown = useMemo(
    () => messages.filter((m) => (activeThread ? m.threadId === activeThread : !m.threadId)),
    [messages, activeThread],
  );
  const countFor = (tid: string) => messages.filter((m) => m.threadId === tid).length;
  const activeThreadObj = threads.find((t) => t.id === activeThread);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [shown.length, activeThread]);

  async function send() {
    if (!text.trim()) return;
    const t = text.trim();
    setText('');
    setSending(true);
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t, threadId: activeThread || undefined }),
        cache: 'no-store',
      });
      if (!res.ok) { const detail = await res.text(); throw new Error(`${res.status} ${detail.slice(0, 100)}`); }
      const d = await res.json();
      setMessages((prev) => [...prev, d.message]);
    } catch (e) {
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  const isHost = !!round && round.hostId === meId;
  async function setOpenChat() {
    const cur = round?.openChatUrl || '';
    const url = window.prompt('LINEオープンチャットのURLを入力してください（空欄で削除）', cur);
    if (url === null) return;
    try {
      const res = await fetch(`/api/rounds/${params.id}/openchat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }), cache: 'no-store',
      });
      if (!res.ok) { const d = await res.text(); throw new Error(d.slice(0, 100)); }
      const d = await res.json();
      setFetchedRound((prev) => ({ ...(prev || (round as Round)), openChatUrl: d.openChatUrl } as Round));
      store.refreshRounds().catch(() => {});
      toast(url.trim() ? 'オープンチャットURLを設定しました' : '削除しました');
    } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }

  async function createThread() {
    const name = (typeof window !== 'undefined') ? window.prompt('スレッド名を入力（例：🚗 配車相談）') : '';
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`/api/rounds/${params.id}/threads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }), cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setThreads((prev) => [...prev, d.thread]);
      setActiveThread(d.thread.id);
    } catch (e) { toast('作成失敗: ' + (e as Error).message, 'error'); }
  }

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <div className="text-base font-black mb-2">参加者専用のグループチャットです</div>
        <div className="text-[13px] text-sub leading-relaxed mb-5">
          このグループチャットは、ラウンドに参加している人だけが閲覧できます。
        </div>
        <button onClick={() => router.push(`/round/${params.id}`)} className="px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">
          募集の詳細を見る
        </button>
      </div>
    );
  }
  if (!round) return <div className="p-5 text-sub">{loaded ? '見つかりません' : '読み込み中...'}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card flex-shrink-0 sticky top-0 z-10">
        {activeThread ? (
          <>
            <button onClick={() => setActiveThread(null)} className="text-blue text-sm font-bold">← 戻る</button>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-bold truncate">{activeThreadObj?.name || 'スレッド'}</div>
              <div className="text-[11px] text-sub truncate">スレッド ・ グループチャットに戻るには「戻る」</div>
            </div>
          </>
        ) : (
          <>
            <button onClick={() => router.push(`/round/${params.id}`)} className="text-xl text-blue">←</button>
            <Link href={`/round/${params.id}`} className="flex-1 min-w-0">
              <div className="text-[15px] font-bold truncate">💬 {round.title}</div>
              <div className="text-[11px] text-sub truncate">タップで募集詳細 ・ 参加者全員のグループチャット</div>
            </Link>
            <button
              onClick={shareChat}
              className="flex-shrink-0 px-3 py-1.5 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold flex items-center gap-1"
              aria-label="このグループチャットを共有"
            >
              <span>🔗</span><span>共有</span>
            </button>
          </>
        )}
      </div>

      {/* LINE Open Chat link — shown if the host set one. Host can set/edit. */}
      {!activeThread && (round?.openChatUrl || isHost) && (
        <div className="bg-card border-b border-border px-4 py-2 flex-shrink-0 flex items-center gap-2">
          {round?.openChatUrl ? (
            <a
              href={round.openChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 flex items-center gap-2 bg-green-light text-green rounded-lg px-3 py-2"
            >
              <span className="text-base">💬</span>
              <span className="text-[12px] font-bold flex-1 min-w-0 truncate">LINEのオープンチャットあり（タップで参加）</span>
              <span className="text-[11px]">↗</span>
            </a>
          ) : (
            <div className="flex-1 text-[11px] text-muted">LINEオープンチャットを使っている場合はURLを設定できます</div>
          )}
          {isHost && (
            <button onClick={setOpenChat} className="flex-shrink-0 text-[11px] font-bold text-blue px-2 py-1">
              {round?.openChatUrl ? '編集' : '＋設定'}
            </button>
          )}
        </div>
      )}

      {/* Thread bar — only in main view */}
      {!activeThread && (
        <div className="bg-card border-b border-border px-4 py-2 flex-shrink-0">
          <div className="text-[10px] font-bold text-sub mb-1.5 flex items-center justify-between">
            <span>📌 スレッド</span><span className="text-muted">{threads.length}件</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveThread(t.id)}
                className="flex-shrink-0 inline-flex items-center gap-1.5 bg-green-light text-green rounded-full px-3 py-1.5 text-[12px] font-bold"
              >
                {t.name}
                <span className="bg-green text-white rounded-full text-[9px] px-1.5 py-px">{countFor(t.id)}</span>
              </button>
            ))}
            <button
              onClick={createThread}
              className="flex-shrink-0 inline-flex items-center gap-1 bg-card border-[1.5px] border-dashed border-green text-green rounded-full px-3 py-1.5 text-[12px] font-bold"
            >＋ 作成</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 px-5 py-4 flex flex-col gap-2.5 overflow-y-auto">
        {shown.length === 0 && (
          <div className="text-center my-10 text-sub text-sm">
            {activeThread ? '🧵 このスレッドの最初の投稿を書きましょう' : '🏌️ ラウンドについて話しましょう'}<br />
            <span className="text-[11px] text-muted">最初のメッセージを送ってみましょう</span>
          </div>
        )}
        {shown.map((m) => {
          const mine = m.senderId === meId;
          const sender = users.find((u) => u.id === m.senderId);
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} gap-2`}>
              {!mine && sender && (
                <Link href={`/profile/${sender.id}`}><Avatar user={sender} size={28} emojiSize={14} /></Link>
              )}
              <div className="flex flex-col max-w-[75%]">
                {!mine && sender && (
                  <Link href={`/profile/${sender.id}`} className="text-[10px] text-muted mb-0.5 ml-1">{sender.displayName}</Link>
                )}
                <div
                  className={`px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'bg-green text-white' : 'bg-card text-text shadow-card'}`}
                  style={{ borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}
                >
                  {m.text}
                  <div className={`text-[10px] mt-1 text-right ${mine ? 'text-white/60' : 'text-muted'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="flex gap-2 px-4 py-3 pb-7 bg-card border-t border-border flex-shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={activeThread ? `「${activeThreadObj?.name || 'スレッド'}」に返信...` : 'メッセージを入力...'}
          className="flex-1 px-4 py-2.5 border-[1.5px] border-border rounded-full text-sm outline-none bg-bg"
        />
        <button onClick={send} disabled={sending} className="px-4 py-2.5 bg-green text-white rounded-full text-[13px] font-bold disabled:opacity-50">送信</button>
      </div>
    </div>
  );
}
