'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea';
import { Linkify } from '@/components/Linkify';
import { toast } from '@/components/Toast';
import { useStore } from '@/lib/store';
import {
  FEATURE_REQUEST_ADMIN_NAME, FEATURE_REQUEST_ADMIN_SENDER, FEATURE_REQUEST_CATEGORY_LABEL, FEATURE_REQUEST_MESSAGE_MAX,
  FEATURE_REQUEST_STATUS_META,
  type FeatureRequestItem, type FeatureRequestMessage,
} from '@/lib/featureRequests';

// 💡 改修要望のスレッド（2026-10-13）。
//   - 最初の投稿（題名・本文）の下に、本人↔運営のやり取りがチャット風に並ぶ
//   - 書けるのは本人だけ（運営は管理画面から）。ほかの会員は読むだけ＋「👍 ほしい」
//   - 10秒ごとに再取得（運営の返信を待っている間に自然に更新される）
export default function RequestThreadPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id || '');
  const meId = useStore((s) => s.meId);
  const [item, setItem] = useState<FeatureRequestItem | null>(null);
  const [messages, setMessages] = useState<FeatureRequestMessage[]>([]);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/requests/${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'include' });
        if (cancelled) return;
        if (r.status === 404) { setMissing(true); return; }
        const d = await r.json();
        if (!r.ok) return;
        setItem(d.item || null);
        setMessages(Array.isArray(d.messages) ? d.messages : []);
        if (firstLoad.current) { firstLoad.current = false; setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50); }
      } catch { /* noop */ }
    }
    load();
    const t = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id]);

  async function send() {
    const t = text.trim();
    if (!t || sending || !item) return;
    setSending(true);
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(id)}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', cache: 'no-store',
        body: JSON.stringify({ text: t }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d?.message || '送信に失敗しました', 'error'); return; }
      setText('');
      setMessages((m) => [...m, d.message]);
      setItem((it) => it ? { ...it, replyCount: it.replyCount + 1, lastMessage: t, lastSenderId: meId, lastMessageAt: Date.now() } : it);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    } catch { toast('通信に失敗しました', 'error'); }
    finally { setSending(false); }
  }

  async function vote() {
    if (voting || !item) return;
    setVoting(true);
    try {
      const r = await fetch(`/api/requests/${encodeURIComponent(id)}/vote`, { method: 'POST', credentials: 'include', cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { toast('うまくいきませんでした', 'error'); return; }
      setItem((it) => it ? { ...it, voted: !!d.voted, voteCount: Number(d.voteCount || 0) } : it);
      if (d.voted) toast('👍 「ほしい」を押しました');
    } catch { toast('通信に失敗しました', 'error'); }
    finally { setVoting(false); }
  }

  if (missing) {
    return (
      <div className="h-full overflow-y-auto px-5 pt-2">
        <Link href="/requests" className="text-sub text-sm">‹ 改修要望</Link>
        <div className="text-center py-16 text-[13px] text-sub">この要望は見つかりませんでした</div>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="h-full overflow-y-auto px-5 pt-2">
        <Link href="/requests" className="text-sub text-sm">‹ 改修要望</Link>
        <div className="text-center py-16 text-[13px] text-sub">読み込み中...</div>
      </div>
    );
  }

  const st = FEATURE_REQUEST_STATUS_META[item.status] || FEATURE_REQUEST_STATUS_META.new;
  const isAuthor = item.authorId === meId;
  // 最初のメッセージは本文と同じなので、チャット欄には2件目以降を出す。
  const thread = messages.length > 0 && messages[0].senderId === item.authorId && messages[0].text === item.body ? messages.slice(1) : messages;
  const d = new Date(item.createdAt);
  const created = item.createdAt ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-2 pb-1 flex items-center gap-2">
          <Link href="/requests" className="text-sub text-sm">‹ 改修要望</Link>
        </div>

        {/* 最初の投稿 */}
        <div className="px-5 pb-3">
          <div className="bg-card rounded-card p-4 shadow-card border-[2.5px] border-border">
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {item.pinned && <span className="text-[10px] font-black px-1.5 py-px rounded-full border text-orange bg-orange-light border-orange">📌 ピン留め</span>}
              <span className={`text-[10px] font-black px-1.5 py-px rounded-full border ${st.className}`}>{st.label}</span>
              <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-bg text-sub border border-border">{FEATURE_REQUEST_CATEGORY_LABEL[item.category] || 'その他'}</span>
            </div>
            <div className="text-[17px] font-black leading-snug">{item.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <Avatar user={{ avatar: item.author.avatar, avatarUrl: item.author.avatarUrl, avatarMode: item.author.avatarMode as any, golmotiType: item.author.golmotiType, color: item.author.color || '#2A8C82' } as any} size={26} />
              <span className="text-[12px] font-bold text-sub truncate">{item.author.displayName}{isAuthor ? '（あなた）' : ''}</span>
              <span className="text-[10.5px] text-muted">{created}</span>
            </div>
            <div className="mt-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words"><Linkify text={item.body} /></div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={vote} disabled={voting}
                className={'px-3 py-1.5 rounded-full text-[12px] font-black border-[1.5px] disabled:opacity-50 ' + (item.voted ? 'bg-green text-white border-green' : 'bg-bg text-sub border-border')}>
                👍 ほしい {item.voteCount > 0 ? item.voteCount : ''}
              </button>
              <span className="text-[11px] text-muted">{item.voted ? 'もう一度押すと取り消せます' : '同じことを思っていたら押してください'}</span>
            </div>
          </div>
          <div className="text-[11px] text-muted mt-2 leading-relaxed">
            {isAuthor ? '運営からの返信はここに届きます（LINEにもお知らせします）。' : 'このスレッドに書けるのは、要望を出した本人と運営だけです。'}
          </div>
        </div>

        {/* やり取り */}
        <div className="px-5 pb-4">
          {thread.length === 0 ? (
            <div className="text-center py-6 text-[12px] text-muted">まだ返信はありません</div>
          ) : (
            thread.map((m) => {
              const admin = m.senderId === FEATURE_REQUEST_ADMIN_SENDER;
              const mine = !admin && m.senderId === meId;
              const t = new Date(m.createdAt);
              const time = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
              return (
                <div key={m.id} className={'flex mb-2.5 ' + (admin ? 'justify-start' : 'justify-end')}>
                  <div className="max-w-[85%]">
                    <div className={'text-[10.5px] font-black mb-0.5 ' + (admin ? 'text-green' : 'text-muted text-right')}>
                      {admin ? FEATURE_REQUEST_ADMIN_NAME : mine ? 'あなた' : item.author.displayName}
                    </div>
                    <div className={'rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words border ' + (admin ? 'bg-green-light border-green rounded-tl-sm' : 'bg-card border-border rounded-tr-sm')}>
                      <Linkify text={m.text} />
                    </div>
                    <div className={'text-[10px] text-muted mt-0.5 ' + (admin ? '' : 'text-right')}>{time}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      {isAuthor && (
        <div className="px-4 py-2.5 border-t border-border bg-bg flex items-end gap-2 pb-[max(10px,env(safe-area-inset-bottom))]">
          <AutoGrowTextarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, FEATURE_REQUEST_MESSAGE_MAX))}
            placeholder="運営に補足・返信を書く"
            className="flex-1 px-3 py-2.5 rounded-xl border-[1.5px] border-border bg-card text-[14px] leading-relaxed resize-none"
          />
          <button type="button" onClick={send} disabled={sending || !text.trim()}
            className="px-4 py-2.5 rounded-xl bg-green text-white text-[13px] font-black disabled:opacity-50">送る</button>
        </div>
      )}
    </div>
  );
}
