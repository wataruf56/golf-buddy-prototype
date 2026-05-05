'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { markRoundChatSeen } from '@/lib/useUnread';
import type { Message } from '@/lib/types';

export default function RoundChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const round = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const users = useStore((s) => s.users);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setMessages(d.messages || []);
    } catch (e) {
      // silent
    }
  }

  useEffect(() => {
    if (!params.id) return;
    load();
    markRoundChatSeen(params.id);
    const interval = setInterval(() => { load(); markRoundChatSeen(params.id); }, 3000);
    return () => clearInterval(interval);
  }, [params.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    if (!text.trim()) return;
    const t = text.trim();
    setText('');
    setSending(true);
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
        cache: 'no-store',
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`${res.status} ${detail.slice(0, 100)}`);
      }
      const d = await res.json();
      setMessages((prev) => [...prev, d.message]);
    } catch (e) {
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  if (!round) return <div className="p-5 text-sub">読み込み中...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card flex-shrink-0 sticky top-0 z-10">
        <button onClick={() => router.push(`/round/${params.id}`)} className="text-xl text-blue">←</button>
        <Link href={`/round/${params.id}`} className="flex-1 min-w-0">
          <div className="text-[15px] font-bold truncate">💬 {round.title}</div>
          <div className="text-[11px] text-sub truncate">タップで募集詳細 ・ 参加者全員のグループチャット</div>
        </Link>
        <span className="text-muted text-sm">›</span>
      </div>

      <div ref={scrollRef} className="flex-1 px-5 py-4 flex flex-col gap-2.5 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center my-10 text-sub text-sm">
            🏌️ ラウンドについて話しましょう<br />
            <span className="text-[11px] text-muted">最初のメッセージを送ってみましょう</span>
          </div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === meId;
          const sender = users.find((u) => u.id === m.senderId);
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} gap-2`}>
              {!mine && sender && (
                <Link href={`/profile/${sender.id}`}>
                  <Avatar user={sender} size={28} emojiSize={14} />
                </Link>
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

      <div className="flex gap-2 px-4 py-3 pb-7 bg-card border-t border-border flex-shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="メッセージを入力..."
          className="flex-1 px-4 py-2.5 border-[1.5px] border-border rounded-full text-sm outline-none bg-bg"
        />
        <button onClick={send} disabled={sending} className="px-4 py-2.5 bg-green text-white rounded-full text-[13px] font-bold disabled:opacity-50">送信</button>
      </div>
    </div>
  );
}
