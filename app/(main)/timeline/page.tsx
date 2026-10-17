'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { track } from '@/lib/telemetry';
import { Avatar } from '@/components/Avatar';
import { REACTIONS } from '@/lib/chatReactions';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';

// タイムライン（2026-10-08）：みんなの動きを LINE のシステムメッセージ風の灰色1行で。lib/timeline 参照。
// 2026-10-17：「今日の写真」（kind='post'）は写真つきのカードで出し、いいね・リアクションを押せる（数を表示）。
//             見られた回数・見ていた時間を記録する（/api/timeline/view・管理画面「📰 タイムライン」で集計）。
type PostInfo = { id: string; image: string; caption?: string; counts: Record<string, number>; mine: string[]; total: number; isMine: boolean; avatar?: string; avatarUrl?: string; userId: string };
type Item = { id: string; kind: 'signup' | 'avail' | 'round' | 'join' | 'crush' | 'post'; at: number; name: string; text: string; sub?: string; link?: string; post?: PostInfo };

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(now.getTime())) return '今日';
  if (dayKey(ts) === dayKey(y.getTime())) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}（${'日月火水木金土'[d.getDay()]}）`;
}
function hm(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 見られた回数・見ていた時間（画面が見えている間だけ数える。閉じた・裏に回った・ほかの画面に移ったら送る）
function useViewTracking() {
  useEffect(() => {
    const viewId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : 0;
    let total = 0;
    let ended = false;
    const send = (payload: object) => {
      const body = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon('/api/timeline/view', new Blob([body], { type: 'text/plain' }))) return;
      } catch { /* fetch で送る */ }
      fetch('/api/timeline/view', { method: 'POST', body, keepalive: true, credentials: 'include' }).catch(() => {});
    };
    send({ viewId, phase: 'start' });
    const flush = () => { if (visibleSince) { total += Date.now() - visibleSince; visibleSince = 0; } };
    const end = () => { if (ended) return; flush(); if (total > 0) send({ viewId, phase: 'end', ms: total }); };
    const onVis = () => {
      if (document.visibilityState === 'hidden') { flush(); send({ viewId, phase: 'end', ms: total }); }
      else if (!visibleSince) visibleSince = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', end);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', end); end(); ended = true; };
  }, []);
}

export default function TimelinePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  useViewTracking();
  useEffect(() => {
    fetch('/api/timeline', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.json()).then((j) => setItems(j.items || [])).catch(() => setItems([]));
  }, []);

  const updatePost = (id: string, patch: Partial<PostInfo> | null) => setItems((cur) => (cur || []).flatMap((it) => {
    if (it.post?.id !== id) return [it];
    return patch === null ? [] : [{ ...it, post: { ...it.post!, ...patch } }];
  }));

  return (
    <div className="pb-6">
      <div className="px-5 pt-4 pb-2">
        <div className="text-[20px] font-black">📰 タイムライン</div>
        <div className="text-[11px] text-sub">みんなの動き（同じ年代のメンバーだけ・30日分）</div>
      </div>
      {items === null && <div className="text-center text-[12px] text-muted py-10">読み込み中...</div>}
      {items && items.length === 0 && <div className="text-center text-[12px] text-muted py-10">まだ動きはありません</div>}
      <div className="px-4">
        {(items || []).map((it, i) => {
          const showDay = i === 0 || dayKey(items![i - 1].at) !== dayKey(it.at);
          const body = (
            <>
              <b className="font-black text-text">{it.name}</b>{it.text}
              {it.sub && <span className="block text-[10.5px] text-sub mt-0.5 truncate">{it.sub}</span>}
            </>
          );
          return (
            <div key={it.id}>
              {showDay && (
                <div className="text-center my-3">
                  <span className="inline-block rounded-full px-3 py-[3px] text-[10.5px] font-bold text-white" style={{ background: 'rgba(0,0,0,.2)' }}>{dayLabel(it.at)}</span>
                </div>
              )}
              {it.kind === 'post' && it.post ? (
                <PostCard it={it} onChange={(p) => updatePost(it.post!.id, p)} />
              ) : (
                <div className="flex items-center gap-2 mb-2">
                  {it.link ? (
                    <Link href={it.link} onClick={() => track('timeline_tap', { kind: it.kind })}
                      className="flex-1 min-w-0 bg-card border-[1.5px] border-border rounded-2xl px-3 py-2 text-[12px] leading-snug text-sub flex items-center gap-2">
                      <span className="flex-1 min-w-0">{body}</span><span className="text-orange font-black">›</span>
                    </Link>
                  ) : (
                    <div className="flex-1 min-w-0 rounded-2xl px-3 py-2 text-[12px] leading-snug text-sub" style={{ background: '#DCE6DF' }}>{body}</div>
                  )}
                  <div className="text-[10px] text-muted w-9 text-right flex-shrink-0">{hm(it.at)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 今日の写真のカード：名前・何日のラウンドか・写真・ひとこと・いいね／リアクション（数つき）
function PostCard({ it, onChange }: { it: Item; onChange: (p: Partial<PostInfo> | null) => void }) {
  const p = it.post!;
  const [picker, setPicker] = useState(false);
  const busy = useRef(false);
  const like = REACTIONS.find((r) => r.key === 'like')!;
  const others = REACTIONS.filter((r) => r.key !== 'like');

  async function react(key: string) {
    if (busy.current) return;
    busy.current = true;
    // 先に画面を変える（押した感触を早く）。失敗したら戻す
    const had = p.mine.includes(key);
    const prev = { counts: p.counts, mine: p.mine, total: p.total };
    const counts = { ...p.counts, [key]: Math.max(0, (p.counts[key] || 0) + (had ? -1 : 1)) };
    if (!counts[key]) delete counts[key];
    onChange({ counts, mine: had ? p.mine.filter((k) => k !== key) : [...p.mine, key], total: p.total + (had ? -1 : 1) });
    try {
      const res = await fetch(`/api/timeline/posts/${encodeURIComponent(p.id)}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }), credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || String(res.status));
      onChange({ counts: j.counts || {}, mine: j.mine || [], total: j.total || 0 });
      track('timeline_react', { key, on: !had });
    } catch { onChange(prev); toast('うまく押せませんでした', 'error'); }
    finally { busy.current = false; setPicker(false); }
  }
  async function remove() {
    if (!(await confirmDialog({ message: 'この投稿をタイムラインから消しますか？（アルバムの写真は残ります）', danger: true, confirmText: '消す' }))) return;
    const res = await fetch(`/api/timeline/posts/${encodeURIComponent(p.id)}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) { onChange(null); toast('投稿を消しました'); } else toast('消せませんでした', 'error');
  }

  return (
    <div className="mb-3 bg-card border-[1.5px] border-border rounded-2xl overflow-hidden shadow-card">
      <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
        <Link href={`/profile/${p.userId}`} className="flex-shrink-0">
          <Avatar user={{ id: p.userId, displayName: it.name, avatar: p.avatar || '⛳', avatarUrl: p.avatarUrl, color: '#2A8C82' } as any} size={34} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] leading-snug"><b className="font-black">{it.name}</b><span className="text-sub">{it.text}</span></div>
          {it.sub && <div className="text-[10.5px] text-sub truncate">📸 {it.sub}</div>}
        </div>
        <div className="text-[10px] text-muted flex-shrink-0">{hm(it.at)}</div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.image} alt={`${it.name}さんの今日の写真`} loading="lazy" className="w-full max-h-[420px] object-cover bg-bg" />
      {p.caption && <div className="px-3 pt-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words">{p.caption}</div>}
      <div className="px-3 pt-2 pb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => react('like')} aria-pressed={p.mine.includes('like')}
            className={'px-3 py-1.5 rounded-full text-[12.5px] font-black border-[1.5px] ' + (p.mine.includes('like') ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub')}>
            {like.emoji} いいね{p.counts.like ? ` ${p.counts.like}` : ''}
          </button>
          {others.filter((r) => p.counts[r.key]).map((r) => (
            <button key={r.key} type="button" onClick={() => react(r.key)} aria-pressed={p.mine.includes(r.key)} aria-label={`${r.label} ${p.counts[r.key]}`}
              className={'px-2.5 py-1.5 rounded-full text-[12.5px] font-bold border-[1.5px] ' + (p.mine.includes(r.key) ? 'bg-green-light border-green text-green' : 'bg-bg border-border text-sub')}>
              {r.emoji} {p.counts[r.key]}
            </button>
          ))}
          <button type="button" onClick={() => setPicker((v) => !v)} aria-label="リアクションを選ぶ"
            className="px-2.5 py-1.5 rounded-full text-[12px] font-black border-[1.5px] border-dashed border-border text-sub bg-card">＋😊</button>
          <span className="ml-auto text-[10.5px] text-muted font-bold">{p.total ? `リアクション ${p.total}` : ''}</span>
        </div>
        {picker && (
          <div className="mt-2 flex gap-1 flex-wrap bg-bg rounded-xl p-1.5">
            {others.map((r) => (
              <button key={r.key} type="button" onClick={() => react(r.key)} aria-label={r.label}
                className={'w-10 h-10 rounded-full text-[20px] ' + (p.mine.includes(r.key) ? 'bg-green-light' : 'bg-card')}>{r.emoji}</button>
            ))}
          </div>
        )}
        {p.isMine && <button type="button" onClick={remove} className="mt-1.5 text-[10.5px] text-muted font-bold underline">この投稿を消す</button>}
      </div>
    </div>
  );
}
