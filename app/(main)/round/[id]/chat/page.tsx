'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { markRoundChatSeen } from '@/lib/useUnread';
import type { Message, Round, RoundThread } from '@/lib/types';

// Branded launch URL (handled in middleware → LIFF). Lets us share a friendly
// goltomo.com/app link that deep-links to this group chat after login.
const SHARE_BASE = 'https://goltomo.com/app';

// 画像を長辺 max px・JPEG quality q にリサイズしてデータURLにする（Firestore保存用に軽量化）。
function resizeImage(file: File, max: number, q: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}

export default function RoundChatPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const meId = useStore((s) => s.meId);
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const users = useStore((s) => s.users);
  const noChat = useStore((s) => !!s.restrictions.noChat);
  const [fetchedRound, setFetchedRound] = useState<Round | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<RoundThread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null); // null = main chat
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const round = storeRound || fetchedRound;

  async function load() {
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, { cache: 'no-store' });
      if (res.status === 403) { setDenied(true); setLoaded(true); return; }
      // ラウンドが削除済み（または存在しない）→ 専用画面を出す。
      // ストアに古いラウンドが残っていても掲示板を開かせず、送信時の 404 を防ぐ。
      if (res.status === 404) { setNotFound(true); setLoaded(true); return; }
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

  // 通知URLに ?thread=... が付いていたら、そのスレッドを直接開く（メンション導線）。
  useEffect(() => {
    const tid = search?.get('thread');
    if (tid) setActiveThread(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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

  // メンション着色用：このラウンドの参加者の表示名（長い順＝部分一致の取りこぼし防止）。
  const memberNames = useMemo(() => {
    const ids = [round?.hostId, ...((round?.applicantIds) || [])].filter(Boolean) as string[];
    const names = Array.from(new Set(ids.map((id) => users.find((u) => u.id === id)?.displayName).filter(Boolean))) as string[];
    return names.sort((a, b) => b.length - a.length);
  }, [round, users]);

  // 本文中の「@表示名 / ＠表示名」を青くハイライト（LINE風）。
  function renderText(text: string, mine: boolean) {
    if (!text) return null;
    if (!memberNames.length) return text;
    const esc = memberNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`[@＠](?:${esc.join('|')})`, 'g');
    const out: any[] = [];
    let last = 0; let k = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(<span key={k++} className={mine ? 'font-black underline' : 'text-blue font-black'}>{m[0]}</span>);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  // メンション候補：このラウンドの参加者（主催者＋承認済み）から自分を除く。
  const mentionMembers = useMemo(() => {
    if (!round) return [] as { id: string; displayName: string }[];
    const ids = [round.hostId, ...(round.applicantIds || [])].filter((id) => id && id !== meId);
    const uniq = Array.from(new Set(ids));
    return uniq
      .map((id) => users.find((u) => u.id === id))
      .filter(Boolean)
      .map((u) => ({ id: (u as any).id as string, displayName: (u as any).displayName as string }));
  }, [round, users, meId]);
  const [showMention, setShowMention] = useState(false);

  // 一度のメッセージで複数人を指名できるよう、@表示名 を本文に追記していく。
  function addMention(name: string) {
    setText((prev) => {
      if (prev.includes('@' + name)) return prev; // 二重挿入を防ぐ
      const sep = prev && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${sep}@${name} `;
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [shown.length, activeThread]);

  async function postMsg(t: string, imageUrl?: string) {
    if (!t.trim() && !imageUrl) return;
    setSending(true);
    try {
      const res = await fetch(`/api/rounds/${params.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t.trim() || undefined, threadId: activeThread || undefined, imageUrl }),
        cache: 'no-store',
      });
      if (!res.ok) { const { readApiError } = await import('@/lib/apiError'); toast(await readApiError(res, '送信に失敗しました'), 'error'); return; }
      const d = await res.json();
      setMessages((prev) => [...prev, d.message]);
    } catch (e) {
      toast('送信に失敗しました', 'error');
    } finally {
      setSending(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    const t = text.trim();
    setText('');
    await postMsg(t);
  }

  async function onPickImage(file: File) {
    if (!file.type.startsWith('image/')) { toast('画像ファイルを選んでください', 'error'); return; }
    setSending(true);
    let dataUrl = '';
    try { dataUrl = await resizeImage(file, 1000, 0.6); }
    catch { setSending(false); toast('画像の読み込みに失敗しました', 'error'); return; }
    setSending(false);
    await postMsg('', dataUrl);
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
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-8 text-center">
        <div className="text-4xl mb-3">🗑️</div>
        <div className="text-base font-black mb-2">このラウンドは削除されました</div>
        <div className="text-[13px] text-sub leading-relaxed mb-5">
          主催者がこの募集を削除したため、グループチャットは利用できません。
        </div>
        <button onClick={() => router.push('/home')} className="px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">
          ホームに戻る
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
                  {m.imageUrl && (
                    <a href={m.imageUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                      <img src={m.imageUrl} alt="画像" className="rounded-lg max-w-full max-h-60 object-cover" />
                    </a>
                  )}
                  {m.text && <div className="whitespace-pre-wrap">{renderText(m.text, mine)}</div>}
                  <div className={`text-[10px] mt-1 text-right ${mine ? 'text-white/60' : 'text-muted'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* メンション候補（複数タップで一度に複数人を指名できる） */}
      {showMention && mentionMembers.length > 0 && (
        <div className="px-4 pt-2 bg-card border-t border-border flex-shrink-0">
          <div className="text-[10px] font-bold text-muted mb-1.5">指名する人をタップ（複数OK）</div>
          <div className="flex gap-1.5 flex-wrap pb-2">
            {mentionMembers.map((m) => {
              const on = text.includes('@' + m.displayName);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => addMention(m.displayName)}
                  className={'px-2.5 py-1 rounded-full text-[12px] font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
                >{on ? '✓ ' : '@'}{m.displayName}</button>
              );
            })}
          </div>
        </div>
      )}

      {/* チャットが制限されている場合は入力欄を出さず、案内だけ表示。 */}
      {noChat ? (
        <div className="px-4 py-4 pb-7 bg-card border-t border-border flex-shrink-0 text-center">
          <div className="text-[12px] font-bold text-sub">🚫 チャットの利用が制限されています</div>
          <div className="text-[11px] text-muted mt-0.5">メッセージの閲覧のみ可能です。</div>
        </div>
      ) : (
      /* Composer */
      <div className="flex gap-2 px-4 py-3 pb-7 bg-card border-t border-border flex-shrink-0">
        {mentionMembers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowMention((v) => !v)}
            aria-label="メンション"
            className={'flex-shrink-0 w-10 h-10 rounded-full text-base font-black border-[1.5px] ' + (showMention ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}
          >@</button>
        )}
        {/* 画像添付 */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={sending}
          aria-label="画像を送る"
          className="self-end flex-shrink-0 w-10 h-10 rounded-full text-lg border-[1.5px] bg-bg border-border text-sub disabled:opacity-50"
        >📷</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); if (fileRef.current) fileRef.current.value = ''; }}
        />
        {/* 改行はEnterで入力可。送信は右の送信ボタンのみ（Enterでは送らない）。 */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder={activeThread ? `「${activeThreadObj?.name || 'スレッド'}」に返信...` : 'メッセージを入力...（改行OK）'}
          className="flex-1 px-4 py-2.5 border-[1.5px] border-border rounded-[18px] text-sm outline-none bg-bg resize-none max-h-28"
        />
        <button onClick={send} disabled={sending} aria-label="送信" className="self-end flex-shrink-0 w-10 h-10 bg-green text-white rounded-full text-base font-bold disabled:opacity-50">➤</button>
      </div>
      )}
    </div>
  );
}
