'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { store, useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  const chat = useStore((s) => s.chats.find((c) => c.id === params.chatId));
  const users = useStore((s) => s.users);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!params.chatId) return;
    store.loadChat(params.chatId);
    const interval = setInterval(() => store.loadChat(params.chatId), 3000);
    return () => clearInterval(interval);
  }, [params.chatId]);

  useEffect(() => {
    if (chat) store.markChatRead(chat.id);
  }, [chat?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat?.messages.length]);

  if (!chat) return <div className="p-5 text-sub">読み込み中...</div>;
  const otherId = chat.participants.find((p) => p !== meId)!;
  const other = users.find((u) => u.id === otherId);
  if (!other) return null;

  async function send() {
    if (!text.trim() || !chat || !other) return;
    const t = text.trim();
    setText('');
    try { await store.sendMessage(chat.id, other.id, t); }
    catch (e) {
      const { toast } = await import('@/components/Toast');
      toast('送信失敗: ' + (e as Error).message, 'error');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card flex-shrink-0">
        <button onClick={() => router.push('/buddies')} className="text-xl text-blue">←</button>
        <Avatar user={other} size={36} />
        <div className="flex-1">
          <div className="text-[15px] font-bold">{other.displayName}</div>
          <div className="text-[11px] text-sub">★{other.reviewAvg} ・ {other.scoreRange}</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 px-5 py-4 flex flex-col gap-2.5 overflow-y-auto">
        <div className="text-center my-5">
          <div className="text-[11px] text-muted bg-bg inline-block px-3 py-1 rounded-[10px]">ラウンド後にゴル友になりました 🎉</div>
        </div>
        {chat.messages.map((m) => {
          const mine = m.senderId === meId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] px-3.5 py-2.5 text-sm leading-relaxed ${mine ? 'bg-green text-white' : 'bg-card text-text shadow-card'}`}
                style={{ borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}
              >
                {m.text}
                <div className={`text-[10px] mt-1 text-right ${mine ? 'text-white/60' : 'text-muted'}`}>
                  {new Date(m.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
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
        <button onClick={send} className="px-4 py-2.5 bg-green text-white rounded-full text-[13px] font-bold">送信</button>
      </div>
    </div>
  );
}
