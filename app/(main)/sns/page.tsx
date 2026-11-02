'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { NotifBell } from '@/components/sns/NotifBell';
import { SNS_TABS_KEY } from '@/components/sns/SnsTabBar';
import { useAvailBadge } from '@/lib/availBadge';
import { PostViewer, sendReaction } from '@/components/sns/PostViewer';
import { CaptionText, PostMedia, RingAvatar, SnsTestBadge, StoryViewer, type SnsUser, type Story } from '@/components/sns/SnsParts';

// インスタ風ホームのテスト版（2026-10-31 本人指定）。運営だけが /sns を直接開いて見る（リンクはどこにも無い）。
// 中身は今のゴルトモの会員・募集・写真（lib/snsTest・読むだけ）。いいね・リアクションは保存しない。
// 2026-11-02（本人指定）：右上は 🔔（components/sns/NotifBell）。DM とマイページは下のタブへ（components/sns/SnsTabBar）。
type FeedItem =
  | { kind: 'photo'; id: string; at: number; user: SnsUser; roundId: string; place: string; when: string; photos: string[]; videos?: string[]; caption: string; tagged: SnsUser[]; mentions?: SnsUser[]; likeKey: string; likes?: number; liked?: boolean; comments?: number; tagApproved?: boolean }
  | { kind: 'played'; id: string; at: number; roundId: string; place: string; when: string; members: SnsUser[]; drink: boolean }
  | { kind: 'open'; id: string; at: number; roundId: string; host: SnsUser; title: string; when: string; area: string; left: number; joined: SnsUser[]; drink: boolean };
type Home = { me: SnsUser; stories: Story[]; feed: FeedItem[]; dmUnread: number };

function ago(at: number): string {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 60) return `${Math.max(1, m)}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}日前` : `${Math.floor(d / 30)}か月前`;
}

function PhotoPost({ it, meId, onChanged }: { it: Extract<FeedItem, { kind: 'photo' }>; meId: string; onChanged: () => void }) {
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState(!!it.liked);
  const [likes, setLikes] = useState(it.likes || 0);
  const [comments, setComments] = useState(it.comments || 0);
  const [viewing, setViewing] = useState(false);
  const isTest = it.id.startsWith('test_');
  const mine = isTest && it.user.id === meId;   // 「…」を出す：自分の投稿と、自分がタグ付けされた投稿（テスト版の投稿だけ）
  const taggedMe = isTest && !!it.mentions?.some((u) => u.id === meId);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 写真を押すとこの投稿だけが開く（PostViewer）。2回続けて押したときは開かずにいいね
  const tapPhoto = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setViewing(true), 260);
  };
  const like = async (on: boolean) => {
    const before = { liked, likes };
    setLiked(on); setLikes(likes + (on === liked ? 0 : on ? 1 : -1));
    try { const r = await sendReaction(it.likeKey, { action: 'like', on }); setLiked(r.liked); setLikes(r.likes); }
    catch { setLiked(before.liked); setLikes(before.likes); }
  };
  return (
    <div className="bg-card border-b border-hair">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Link href={`/sns/u/${it.user.id}`}><RingAvatar user={it.user} size={36} /></Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link href={`/sns/u/${it.user.id}`} className="text-[13px] font-black">{it.user.name}</Link>
          {it.place && <Link href={`/round/${it.roundId}`} className="block text-[11px] text-sub truncate">{it.place}{it.when ? `・${it.when}` : ''}</Link>}
        </div>
      </div>
      <div className="relative bg-bg">
        <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar" style={{ scrollbarWidth: 'none' }}
          onScroll={(e) => { const el = e.currentTarget; setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {it.photos.map((src, k) => (
            <PostMedia key={k} src={src} video={it.videos?.[k]} onClick={tapPhoto} onDoubleClick={() => { if (tapTimer.current) clearTimeout(tapTimer.current); like(true); }} className={`w-full flex-shrink-0 snap-center aspect-square ${it.videos?.[k] ? 'object-contain' : 'object-cover'}`} />
          ))}
        </div>
        {it.photos.length > 1 && <span className="absolute right-2.5 top-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-bold">{idx + 1}/{it.photos.length}</span>}
        {it.tagged.length > 0 && <span className="absolute left-2.5 bottom-2.5 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-bold">👥 一緒に回った {it.tagged.length}人</span>}
      </div>
      <div className="flex items-center gap-4 px-3 pt-2.5 text-[22px] leading-none">
        <button type="button" aria-label="いいね" onClick={() => like(!liked)} className="flex items-center gap-1"><span className={liked ? 'text-orange' : ''}>{liked ? '♥' : '♡'}</span>{likes > 0 && <span className="text-[12px] font-black">{likes}</span>}</button>
        <button type="button" aria-label="コメント" onClick={() => setViewing(true)} className="flex items-center gap-1"><span>💬</span>{comments > 0 && <span className="text-[12px] font-black">{comments}</span>}</button>
        {it.roundId && <Link href={`/round/${it.roundId}`} aria-label="ラウンドを開く" className="text-[20px]">⛳</Link>}
        {it.photos.length > 1 && (
          <span className="flex gap-1 mx-auto pr-12">
            {it.photos.map((_, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full ${k === idx ? 'bg-green' : 'bg-border'}`} />)}
          </span>
        )}
      </div>
      <div className="px-3 pt-1.5 pb-3 text-[12.5px] leading-relaxed">
        {it.caption && <div><Link href={`/sns/u/${it.user.id}`} className="font-black mr-1">{it.user.name}</Link><CaptionText text={it.caption} mentions={it.mentions} /></div>}
        {it.tagged.length > 0 && (
          <div className="text-green font-bold">
            {it.tagged.slice(0, 6).map((u) => <Link key={u.id} href={`/sns/u/${u.id}`} className="mr-1.5">@{u.name}</Link>)}
            {it.tagged.length > 6 && <span className="text-sub">ほか{it.tagged.length - 6}人</span>}
          </div>
        )}
        <div className="text-[10.5px] text-muted mt-0.5">{ago(it.at)}</div>
      </div>
      {viewing && (
        <PostViewer user={it.user} isMe={mine || taggedMe} onClose={() => setViewing(false)} onDeleted={onChanged} onReaction={(r) => { setLiked(r.liked); setLikes(r.likes); setComments(r.comments.length); }}
          tile={{ key: it.id, likeKey: it.likeKey, roundId: it.roundId, photos: it.photos, videos: it.videos, place: it.place, when: it.when, drink: false, caption: it.caption, mentions: it.mentions || [], at: it.at, by: mine ? undefined : it.user, tagApproved: it.tagApproved, postId: isTest ? it.id.slice(5) : undefined }} />
      )}
    </div>
  );
}

function PlayedPost({ it }: { it: Extract<FeedItem, { kind: 'played' }> }) {
  return (
    <div className="bg-card border-b border-hair px-3 py-3">
      <Link href={`/round/${it.roundId}`} className="block rounded-2xl bg-[#EAF3EE] px-4 py-4">
        <div className="text-[11px] font-black text-green">{it.drink ? '🍻 飲み会' : '⛳ ラウンドしました'}・{it.when}</div>
        <div className="text-[15px] font-black mt-1">{it.place}</div>
        <div className="flex items-center mt-2.5">
          {it.members.slice(0, 7).map((u, k) => (
            <span key={u.id} className="rounded-full border-2 border-[#EAF3EE]" style={{ marginLeft: k ? -10 : 0 }}><Avatar user={u as any} size={30} /></span>
          ))}
          <span className="ml-2 text-[11.5px] font-bold text-sub">{it.members.slice(0, 2).map((u) => u.name).join('、')}{it.members.length > 2 ? ` ほか${it.members.length - 2}人` : ''}</span>
        </div>
        <div className="text-[10.5px] text-muted mt-2">写真はまだありません</div>
      </Link>
    </div>
  );
}

function OpenPost({ it }: { it: Extract<FeedItem, { kind: 'open' }> }) {
  return (
    <div className="bg-card border-b border-hair px-3 py-3">
      <div className="rounded-2xl border-2 border-border px-4 py-3">
        <div className="text-[11px] font-black text-orange">{it.drink ? '🍻 募集中の飲み会' : '🚩 募集中のラウンド'}</div>
        <div className="text-[14px] font-black mt-1 leading-snug">{it.title}</div>
        <div className="text-[11.5px] text-sub mt-0.5">{it.when}{it.area ? `・${it.area}` : ''}{it.left > 0 ? `・あと${it.left}人` : ''}</div>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center min-w-0">
            <Avatar user={it.host as any} size={24} />
            <span className="ml-1.5 text-[11px] font-bold text-sub truncate">{it.host.name}{it.joined.length ? `・${it.joined.length}人参加` : ''}</span>
          </div>
          <Link href={`/round/${it.roundId}`} className="px-4 py-1.5 rounded-full bg-orange text-white text-[12px] font-black flex-shrink-0">見てみる</Link>
        </div>
      </div>
    </div>
  );
}

export default function SnsHomePage() {
  const [data, setData] = useState<Home | null | 'none'>(null);
  const [open, setOpen] = useState<number | null>(null);
  const router = useRouter();
  const availNew = useAvailBadge();
  const load = () => fetch('/api/sns/home', { cache: 'no-store', credentials: 'include' })
    .then((r) => (r.ok ? r.json() : 'none')).then(setData).catch(() => setData('none'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (data === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (!data) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  return (
    <div className="pb-8 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-4 h-12">
        <span className="text-[20px] font-black tracking-tight whitespace-nowrap">ゴルトモ</span><SnsTestBadge short />
        <span className="ml-auto flex items-center gap-4 text-[20px]">
          {/* 募集を立てる入口は、これまで今のホームにしか無かった */}
          <Link href="/create" className="px-2 py-1 rounded-full bg-orange text-white text-[11px] font-black whitespace-nowrap">＋ 募集</Link>
          <Link href="/sns/post" aria-label="写真を投稿（テスト版）">📷</Link>
          <Link href="/availability" aria-label="行ける日" className="relative">📅{availNew > 0 && <span className="absolute -top-1.5 -right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-red text-white text-[10px] font-black flex items-center justify-center border-2 border-card">{availNew > 99 ? '99+' : availNew}</span>}</Link>
          <NotifBell />
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto px-3 py-3 border-b border-hair" style={{ scrollbarWidth: 'none' }}>
        {/* 自分の丸：ひとことがあれば開く・「＋」で新しく書く（2026-11-01） */}
        {(() => {
          const firstMine = data.stories.findIndex((x) => x.kind === 'text' && x.mine);
          const mineCount = data.stories.filter((x) => x.kind === 'text' && x.mine).length;
          const answers = data.stories.reduce((n, x) => n + (x.kind === 'text' && x.mine ? x.answers : 0), 0);
          return (
            <div className="relative flex flex-col items-center w-[66px] flex-shrink-0">
              <button type="button" onClick={() => (firstMine >= 0 ? setOpen(firstMine) : router.push('/sns/new'))} aria-label="自分のひとこと" className="flex flex-col items-center">
                <RingAvatar user={data.me} size={62} ring={firstMine >= 0 ? 'orange' : null} />
                <span className="text-[10.5px] font-bold mt-1 truncate w-full text-center">{firstMine >= 0 ? 'あなた' : 'ひとこと'}</span>
                <span className="text-[9.5px] font-bold text-orange">{firstMine >= 0 ? `${mineCount}件・回答${answers}` : '書く'}</span>
              </button>
              <Link href="/sns/new" aria-label="ひとことを書く" className="absolute right-0 top-[44px] w-[22px] h-[22px] rounded-full bg-green text-white text-[15px] leading-[18px] text-center font-black border-2 border-card">＋</Link>
            </div>
          );
        })()}
        {data.stories.map((s, k) => (s.kind === 'text' && s.mine ? null : (
          <button key={`${s.kind}_${s.kind === 'text' ? s.id : s.user.id}`} type="button" onClick={() => setOpen(k)} className="flex flex-col items-center w-[66px] flex-shrink-0">
            <RingAvatar user={s.user} size={62} ring={s.kind === 'recent' ? 'green' : 'orange'} />
            <span className="text-[10.5px] font-bold mt-1 truncate w-full text-center">{s.user.name}</span>
            <span className={`text-[9.5px] font-bold truncate w-full text-center ${s.kind === 'recent' ? 'text-green' : 'text-orange'}`}>{s.kind === 'text' ? `${s.video ? '🎬 ' : s.photo ? '📷 ' : ''}${s.dateLabel ? `${s.dateLabel.replace(/（.）/, '')} ` : ''}ひとこと` : s.kind === 'avail' ? `${s.dates[0]?.label.replace(/（.）/, '')} 行ける` : `${s.when.replace(/（.）/, '')} ラウンド`}</span>
          </button>
        )))}
      </div>

      {data.feed.length === 0 && <div className="text-center text-[12px] text-muted py-14">まだ投稿がありません</div>}
      {data.feed.map((it) => it.kind === 'photo' ? <PhotoPost key={it.id} it={it} meId={data.me.id} onChanged={load} /> : it.kind === 'played' ? <PlayedPost key={it.id} it={it} /> : <OpenPost key={it.id} it={it} />)}

      <div className="text-center text-[10.5px] text-muted px-6 pt-5 leading-relaxed">
        テスト版：あなたにしか見えません。いいね・リアクション・フォロー・ひとこと・写真の投稿・メンション・テスト版のDMは、ほかの会員には伝わりません。
        <Link href="/home" onClick={() => { try { sessionStorage.removeItem(SNS_TABS_KEY); } catch { /* noop */ } }} className="block mt-2 font-black text-sub underline">テスト版を終えて、今のタブに戻す</Link>
      </div>
      {open !== null && <StoryViewer stories={data.stories} start={open} onClose={() => { setOpen(null); load(); }} onChanged={load} />}
    </div>
  );
}
