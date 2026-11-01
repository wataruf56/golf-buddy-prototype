'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Portal } from '@/components/Portal';
import { toast } from '@/components/Toast';
import { CaptionText, PostMedia, RingAvatar, agoLabel, snsUserHref, type SnsUser } from '@/components/sns/SnsParts';

// プロフィールの写真のマスを押したときに開く画面（テスト版・2026-11-01）。
// 押した写真から始まり、下へスクロールすると次の投稿が続く（インスタと同じ）。写真は切り抜かず全体を見せる。
// by があるマス（タグ付けされた投稿）は、投稿したのがプロフィールの人ではなく by の人。消せるのは投稿した本人だけなので、消すボタンも出さない。
export type PostTile = { key: string; postId?: string; roundId: string; photos: string[]; videos?: string[]; place: string; when: string; drink: boolean; caption: string; mentions: SnsUser[]; at: number; by?: SnsUser; tagApproved?: boolean };

function PostCard({ t, user: owner, isMe, onDeleted }: { t: PostTile; user: SnsUser; isMe: boolean; onDeleted: () => void }) {
  const user = t.by || owner;
  const href = t.by ? snsUserHref(t.by.id) : '';
  const [idx, setIdx] = useState(0);
  const [asking, setAsking] = useState(false);
  async function remove() {
    try {
      const r = await fetch(`/api/sns/post/${encodeURIComponent(t.postId!)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'delete' }) });
      if (!r.ok) throw new Error();
      toast('投稿を消しました');
      onDeleted();
    } catch { toast('うまくいきませんでした', 'error'); }
  }
  return (
    <div className="border-b border-hair">
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
            <PostMedia key={k} src={src} video={t.videos?.[k]} className="w-full flex-shrink-0 snap-center object-contain" style={{ maxHeight: '75vh', minHeight: 200 }} />
          ))}
        </div>
        {t.photos.length > 1 && <span className="absolute right-2.5 top-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-bold">{idx + 1}/{t.photos.length}</span>}
      </div>
      <div className="px-3 pt-2 pb-3 text-[12.5px] leading-relaxed">
        {t.caption && <div className="whitespace-pre-wrap"><span className="font-black mr-1">{user.name}</span><CaptionText text={t.caption} mentions={t.mentions} /></div>}
        <div className="text-[10.5px] text-muted mt-0.5">{t.postId ? agoLabel(t.at) : t.when}</div>
      </div>
    </div>
  );
}

export function PostViewer({ user, tiles, start, isMe, onClose, onDeleted }: { user: SnsUser; tiles: PostTile[]; start: string; isMe: boolean; onClose: () => void; onDeleted: () => void }) {
  const startRef = useRef<HTMLDivElement>(null);
  useEffect(() => { startRef.current?.scrollIntoView(); }, []);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);
  // 端末の「戻る」（iPhone のスワイプなど）で、この画面だけ閉じる。Next の状態（history.state）は引き継ぐ
  useEffect(() => {
    window.history.pushState({ ...window.history.state }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Portal>
      <div className="fixed inset-0 z-[300] bg-card flex justify-center">
        <div className="w-full max-w-[480px] h-full flex flex-col">
          <div className="flex items-center px-3 h-12 border-b border-hair flex-shrink-0">
            <button type="button" onClick={() => window.history.back()} aria-label="閉じる" className="w-8 h-8 text-[20px]">‹</button>
            <span className="text-[15px] font-black">投稿</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tiles.map((t) => (
              <div key={t.key} ref={t.key === start ? startRef : undefined}>
                <PostCard t={t} user={user} isMe={isMe} onDeleted={() => { onDeleted(); if (t.key === start || tiles.length <= 1) window.history.back(); }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Portal>
  );
}
