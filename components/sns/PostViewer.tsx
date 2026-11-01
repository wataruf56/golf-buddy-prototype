'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';
import { CaptionText, PostMedia, RingAvatar, agoLabel, snsUserHref, type SnsUser } from '@/components/sns/SnsParts';

// 写真を押したときに開く画面（テスト版・2026-11-01）。押した投稿だけを出す（本人指定）。写真は切り抜かず全体を見せる。
// いいね・コメントができる（lib/snsTestReactions・テスト版の中だけの記録で、誰にも通知しない）。
// by があるマス（タグ付けされた投稿・ホームの投稿）は、投稿したのがプロフィールの人ではなく by の人。消せるのは投稿した本人だけなので、消すボタンも出さない。
export type PostTile = { key: string; likeKey: string; postId?: string; roundId: string; photos: string[]; videos?: string[]; place: string; when: string; drink: boolean; caption: string; mentions: SnsUser[]; at: number; by?: SnsUser; tagApproved?: boolean };
export type Reactions = { likes: number; liked: boolean; comments: { id: string; user: SnsUser; text: string; at: number; mine: boolean }[] };

export async function sendReaction(likeKey: string, body: Record<string, unknown>): Promise<Reactions> {
  const r = await fetch('/api/sns/reactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ key: likeKey, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'うまくいきませんでした');
  return j;
}

export function PostViewer({ user: owner, tile: t, isMe, onClose, onDeleted, onReaction }: { user?: SnsUser; tile: PostTile; isMe: boolean; onClose: () => void; onDeleted?: () => void; onReaction?: (r: Reactions) => void }) {
  const user = (t.by || owner)!;
  const href = t.by ? snsUserHref(t.by.id) : '';
  const [idx, setIdx] = useState(0);
  const [asking, setAsking] = useState(false);
  const [askingComment, setAskingComment] = useState('');
  const [r, setR] = useState<Reactions | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/sns/reactions?key=${encodeURIComponent(t.likeKey)}`, { cache: 'no-store', credentials: 'include' }).then((x) => (x.ok ? x.json() : null)).then((j) => j && setR(j)).catch(() => {});
  }, [t.likeKey]);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);
  // 端末の「戻る」（iPhone のスワイプなど）で、この画面だけ閉じる。Next の状態（history.state）は引き継ぐ
  useEffect(() => {
    window.history.pushState({ ...window.history.state }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: Reactions) => { setR(next); onReaction?.(next); };
  async function toggleLike() {
    if (!r) return;
    const before = r;
    setR({ ...r, liked: !r.liked, likes: r.likes + (r.liked ? -1 : 1) });   // 押した瞬間に変える
    try { apply(await sendReaction(t.likeKey, { action: 'like', on: !before.liked })); }
    catch { setR(before); toast('うまくいきませんでした', 'error'); }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try { apply(await sendReaction(t.likeKey, { action: 'comment', text: v })); setText(''); }
    catch (err) { toast((err as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  async function removeComment(id: string) {
    try { apply(await sendReaction(t.likeKey, { action: 'deleteComment', id })); }
    catch { toast('うまくいきませんでした', 'error'); }
    setAskingComment('');
  }
  async function remove() {
    try {
      const x = await fetch(`/api/sns/post/${encodeURIComponent(t.postId!)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'delete' }) });
      if (!x.ok) throw new Error();
      toast('投稿を消しました');
      onDeleted?.();
      window.history.back();
    } catch { toast('うまくいきませんでした', 'error'); }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] bg-card flex justify-center">
        <div className="w-full max-w-[480px] h-full flex flex-col">
          <div className="flex items-center px-3 h-12 border-b border-hair flex-shrink-0">
            <button type="button" onClick={() => window.history.back()} aria-label="閉じる" className="w-8 h-8 text-[20px]">‹</button>
            <span className="text-[15px] font-black">投稿</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <RingAvatar user={user} size={36} />
              <div className="min-w-0 flex-1 leading-tight">
                {href ? <Link href={href} className="block text-[13px] font-black truncate">{user.name}</Link> : <div className="text-[13px] font-black truncate">{user.name}</div>}
                {t.place && (t.roundId
                  ? <Link href={`/round/${t.roundId}`} className="block text-[11px] text-sub truncate">{t.place}{t.when ? `・${t.when}` : ''}</Link>
                  : <div className="text-[11px] text-sub truncate">{t.place}</div>)}
              </div>
              {isMe && t.postId && !t.by && (asking
                ? <button type="button" onClick={remove} className="px-2.5 py-1 rounded-lg bg-red text-white text-[11px] font-black flex-shrink-0">本当に消す</button>
                : <button type="button" onClick={() => setAsking(true)} className="px-2.5 py-1 rounded-lg bg-bg text-sub text-[11px] font-black flex-shrink-0">消す</button>)}
            </div>
            <div className="relative bg-black">
              <div className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}
                onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
                {t.photos.map((src, k) => (
                  <PostMedia key={k} src={src} video={t.videos?.[k]} className="w-full flex-shrink-0 snap-center object-contain" style={{ maxHeight: '70vh', minHeight: 200 }} />
                ))}
              </div>
              {t.photos.length > 1 && <span className="absolute right-2.5 top-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-bold">{idx + 1}/{t.photos.length}</span>}
            </div>
            <div className="flex items-center gap-4 px-3 pt-2.5">
              <button type="button" onClick={toggleLike} disabled={!r} aria-label={r?.liked ? 'いいねを取り消す' : 'いいね'} className="flex items-center gap-1">
                <span className={`text-[24px] leading-none ${r?.liked ? 'text-orange' : ''}`}>{r?.liked ? '♥' : '♡'}</span>
                <span className="text-[12.5px] font-black">{r?.likes || 0}</span>
              </button>
              <span className="flex items-center gap-1"><span className="text-[20px] leading-none">💬</span><span className="text-[12.5px] font-black">{r?.comments.length || 0}</span></span>
            </div>
            <div className="px-3 pt-2 pb-3 text-[12.5px] leading-relaxed border-b border-hair">
              {t.caption && <div className="whitespace-pre-wrap"><span className="font-black mr-1">{user.name}</span><CaptionText text={t.caption} mentions={t.mentions} /></div>}
              <div className="text-[10.5px] text-muted mt-0.5">{t.postId ? agoLabel(t.at) : t.when}</div>
            </div>
            {r && r.comments.length === 0 && <div className="text-center text-[12px] text-muted py-6">まだコメントはありません</div>}
            {r?.comments.map((c) => (
              <div key={c.id} className="flex gap-2.5 px-3 py-2.5">
                <Avatar user={c.user as any} size={30} />
                <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                  <div className="whitespace-pre-wrap break-words">{snsUserHref(c.user.id) ? <Link href={snsUserHref(c.user.id)} className="font-black mr-1">{c.user.name}</Link> : <span className="font-black mr-1">{c.user.name}</span>}{c.text}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10.5px] text-muted">
                    <span>{agoLabel(c.at)}</span>
                    {c.mine && (askingComment === c.id
                      ? <button type="button" onClick={() => removeComment(c.id)} className="font-black text-red">本当に消す</button>
                      : <button type="button" onClick={() => setAskingComment(c.id)} className="font-black">消す</button>)}
                  </div>
                </div>
              </div>
            ))}
            <div className="text-center text-[10.5px] text-muted px-6 py-3">テスト版：いいねとコメントはテスト版の中だけの記録で、誰にも通知されません。</div>
          </div>
          <form onSubmit={send} className="flex items-center gap-2 px-3 pt-2 border-t border-hair flex-shrink-0" style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="コメントを書く" className="flex-1 min-w-0 px-3 py-2 rounded-full border-2 border-border bg-card text-[16px] outline-none" />
            <button type="submit" disabled={busy || !text.trim()} className="px-3.5 py-2 rounded-full bg-orange text-white text-[13px] font-black flex-shrink-0 disabled:opacity-50">{busy ? '…' : '送信'}</button>
          </form>
        </div>
      </div>
    </Portal>
  );
}
