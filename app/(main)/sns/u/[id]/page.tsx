'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { RingAvatar, SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';
import { chatIdFor, revisitStar, revisitScoreText, hasRevisitStar } from '@/lib/utils';
import { GolfBallRating } from '@/components/GolfBallRating';
import { MannerBadge } from '@/components/MannerBadge';
import { PostViewer, type PostTile } from '@/components/sns/PostViewer';

// インスタ風プロフィールのテスト版（2026-10-31 本人指定・運営だけ・lib/snsTest）。
// 数字は「ラウンド／フォロワー／フォロー」。DM は相互フォローのときだけ押せる。
// フォロー／解除はテスト版だけの記録（snsTestFollows）に入る。既存の友達・DMの範囲は変わらない。
// 2026-11-01：ほかの人のプロフィールに評価（★・「◯人中◯人が行きたい」・マナー）を今のプロフィールと同じ中身で出す（/api/users/[id]/track-record）。
//             フォロワー・フォローの数を押すと一覧（共通／フォロワー／フォロー中・/sns/u/[id]/follows）。
// 2026-11-01：写真のマスを押すと写真が大きく開く（components/sns/PostViewer）。写真の無いマスは、自分のプロフィールならそのラウンドの写真を投稿する画面へ。
//             自分のプロフィールに「写真を投稿」（/sns/post・lib/snsTestPosts）。
// 2026-11-01（本人指定）：写真タブは本人が上げたものだけ。ラウンドは「過去参加したラウンド」タブにまとめる。
//             「タグ付け」タブ：許可した投稿だけ、来た人全員に見える。本人にだけ未許可の投稿も見え、1件ずつ許可／取り消しできる（誰にも通知しない）。
type Profile = {
  user: SnsUser & { bio: string; scoreRange: string; playStyle: string; golfHistory: string; golmotiName: string };
  isMe: boolean;
  stats: { rounds: number; followers: number; following: number };
  iFollow: boolean; followsMe: boolean; mutual: boolean;
  known: string[]; knownMore: number;
  tiles: PostTile[]; tagged: PostTile[]; pastRounds: PostTile[];
  upcoming: { roundId: string; title: string; when: string; area: string; host: boolean }[];
  buddies: { user: SnsUser; n: number }[];
};

const TILE_BG = ['#DCEFEA', '#FCE6DD', '#E8EEF8', '#FFF1D6', '#EDE9F8', '#E4F2DC'];

export default function SnsProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [p, setP] = useState<Profile | null | 'none'>(null);
  const [tab, setTab] = useState<'grid' | 'tagged' | 'rounds' | 'plan' | 'buddy'>('grid');
  const [busy, setBusy] = useState(false);
  const [meId, setMeId] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  const [tagBusy, setTagBusy] = useState('');
  const [track, setTrack] = useState<{ roundedWith: number; againCount: number; neverCount: number; mannerPenalty: number } | null>(null);
  const load = () => fetch(`/api/sns/user/${encodeURIComponent(params.id)}`, { cache: 'no-store', credentials: 'include' })
    .then((r) => (r.ok ? r.json() : 'none')).then(setP).catch(() => setP('none'));
  // 評価（自分のプロフィールでは出さない＝今のプロフィールと同じ）
  useEffect(() => {
    if (params.id === 'me') return;
    fetch(`/api/users/${encodeURIComponent(params.id)}/track-record`, { cache: 'no-store', credentials: 'include' }).then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTrack({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0, neverCount: d.neverCount || 0, mannerPenalty: d.mannerPenalty || 0 })).catch(() => {});
  }, [params.id]);
  useEffect(() => { load(); fetch('/api/sns/user/me', { cache: 'no-store', credentials: 'include' }).then((r) => r.json()).then((j) => setMeId(j?.user?.id || '')).catch(() => {}); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (!p) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;
  const u = p.user;

  const follow = async () => {
    if (busy) return;
    setBusy(true);
    const on = !p.iFollow;
    try {
      const r = await fetch('/api/sns/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: u.id, on }) });
      if (!r.ok) throw new Error();
      toast(on ? 'フォローしました（テスト版）' : 'フォローを外しました（テスト版）');
      await load();
    } catch { toast('うまくいきませんでした', 'error'); } finally { setBusy(false); }
  };

  const setTag = async (t: PostTile, on: boolean) => {
    if (tagBusy) return;
    setTagBusy(t.key);
    try {
      const r = await fetch(`/api/sns/post/${encodeURIComponent(t.postId!)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'tag', on }) });
      if (!r.ok) throw new Error();
      await load();
      toast(on ? 'プロフィールに公開しました' : '公開をやめました');
    } catch { toast('うまくいきませんでした', 'error'); } finally { setTagBusy(''); }
  };
  const pending = p.tagged.filter((t) => !t.tagApproved);
  const approved = p.tagged.filter((t) => t.tagApproved);
  const viewerTiles = (tab === 'tagged' ? p.tagged : tab === 'rounds' ? p.pastRounds : p.tiles).filter((t) => t.photos.length > 0);
  // 写真のマス（押すと大きく開く）。動画は表紙に ▶
  const photoTile = (t: PostTile, k: number, label?: boolean) => (
    <button key={t.key} type="button" onClick={() => setViewing(t.key)} aria-label="写真を大きく見る" className="relative aspect-square overflow-hidden" style={{ background: TILE_BG[k % TILE_BG.length] }}>
      <img src={t.photos[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
      {t.videos?.[0] ? <span className="absolute right-1 top-1 text-white text-[12px] drop-shadow">▶</span> : t.photos.length > 1 && <span className="absolute right-1 top-1 text-white text-[11px] drop-shadow">❐</span>}
      {label && (
        <span className="absolute inset-x-0 bottom-0 px-1.5 pt-4 pb-1 text-left text-white leading-tight" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}>
          <span className="block text-[10px] font-black truncate">{t.place}</span>
          <span className="block text-[9px]">{t.when}</span>
        </span>
      )}
    </button>
  );
  // 自分のタグ付けの1件（写真を押すと大きく開く）
  const tagRow = (t: PostTile) => (
    <div key={t.key} className="flex items-center gap-2.5 px-3 py-2 border-b border-hair">
      <button type="button" onClick={() => setViewing(t.key)} aria-label="投稿を見る" className="relative w-16 h-16 rounded-lg overflow-hidden bg-bg flex-shrink-0">
        <img src={t.photos[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
        {t.videos?.[0] && <span className="absolute right-1 top-1 text-white text-[11px] drop-shadow">▶</span>}
      </button>
      <div className="min-w-0 flex-1 leading-snug">
        <div className="text-[12.5px] font-black truncate">{t.by?.name}</div>
        <div className="text-[11px] text-sub line-clamp-2">{t.caption}</div>
      </div>
      {t.tagApproved
        ? <button type="button" onClick={() => setTag(t, false)} disabled={!!tagBusy} className="px-3 py-1.5 rounded-lg bg-bg text-sub text-[11.5px] font-black flex-shrink-0 disabled:opacity-50">公開をやめる</button>
        : <button type="button" onClick={() => setTag(t, true)} disabled={!!tagBusy} className="px-3 py-1.5 rounded-lg bg-orange text-white text-[11.5px] font-black flex-shrink-0 disabled:opacity-50">許可する</button>}
    </div>
  );

  return (
    <div className="pb-8 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card border-b border-hair flex items-center px-3 h-12">
        <button type="button" onClick={() => router.back()} aria-label="戻る" className="w-8 h-8 text-[20px]">‹</button>
        <span className="text-[16px] font-black truncate">{u.name}</span><SnsTestBadge />
        <Link href="/sns" className="ml-auto text-[12px] font-bold text-sub">ホーム</Link>
      </div>

      <div className="flex items-center gap-4 px-4 pt-4">
        <RingAvatar user={u} size={86} ring={p.stats.rounds ? 'green' : null} />
        <div className="flex-1 flex justify-around text-center">
          <div><div className="text-[17px] font-black">{p.stats.rounds}</div><div className="text-[11px] text-sub">ラウンド</div></div>
          <Link href={`/sns/u/${encodeURIComponent(params.id)}/follows?tab=followers`}><div className="text-[17px] font-black">{p.stats.followers}</div><div className="text-[11px] text-sub">フォロワー</div></Link>
          <Link href={`/sns/u/${encodeURIComponent(params.id)}/follows?tab=following`}><div className="text-[17px] font-black">{p.stats.following}</div><div className="text-[11px] text-sub">フォロー</div></Link>
        </div>
      </div>

      <div className="px-4 pt-3 text-[12.5px] leading-relaxed">
        <div className="text-[14px] font-black">{u.name}{u.age ? <span className="ml-1.5 text-[11px] font-bold text-sub">{u.age}歳</span> : null}</div>
        <div className="flex flex-wrap gap-1.5 my-1.5">
          {u.golmotiName && <span className="px-2 py-0.5 rounded-full bg-green-light text-green text-[11px] font-bold">{u.golmotiName}</span>}
          {u.area && <span className="px-2 py-0.5 rounded-full bg-bg text-sub text-[11px] font-bold">{u.area}</span>}
          {u.scoreRange && <span className="px-2 py-0.5 rounded-full bg-bg text-sub text-[11px] font-bold">スコア {u.scoreRange}</span>}
          {u.car === 'have' && <span className="px-2 py-0.5 rounded-full bg-orange-light text-orange text-[11px] font-bold">車あり</span>}
          {u.golfHistory && <span className="px-2 py-0.5 rounded-full bg-bg text-sub text-[11px] font-bold">歴 {u.golfHistory}</span>}
        </div>
        {/* 評価（ほかの人を見たときだけ・今のプロフィールと同じ中身） */}
        {!p.isMe && (
          <div className="my-2 rounded-xl border-[1.5px] border-green bg-green-light px-3 py-2">
            <div className="text-[10.5px] font-black text-green">レビュー</div>
            <div className="mt-0.5"><GolfBallRating value={revisitStar(track?.roundedWith, track?.againCount, track?.neverCount, track?.mannerPenalty)} label={revisitScoreText(track?.roundedWith, track?.againCount, track?.neverCount, track?.mannerPenalty)} count={track?.roundedWith || 0} rated={hasRevisitStar(track)} size={16} /></div>
            {track && track.roundedWith > 0 && (
              <>
                <div className="text-[10.5px] text-sub font-bold leading-snug mt-1">「この人からまた次のラウンドに誘われたら、行きたいと思う？」</div>
                <div className="text-[12.5px] font-black text-green">→ {track.roundedWith}人中 {track.againCount}人が「行きたい」と答えています</div>
              </>
            )}
            <MannerBadge penalty={track?.mannerPenalty || 0} />
          </div>
        )}
        {u.bio && <div className="whitespace-pre-wrap">{u.bio}</div>}
        {!p.isMe && p.known.length > 0 && (
          <Link href={`/sns/u/${encodeURIComponent(params.id)}/follows?tab=mutual`} className="block text-[11.5px] text-sub mt-1">{p.known.join('、')}{p.knownMore ? ` ほか${p.knownMore}人` : ''}がフォロー中 ›</Link>
        )}
        {!p.isMe && p.followsMe && !p.iFollow && <div className="text-[11.5px] text-green font-bold mt-1">あなたをフォローしています</div>}
      </div>

      <div className="flex gap-1.5 px-4 pt-3">
        {p.isMe ? (
          <Link href="/mypage/edit" className="flex-1 py-2 rounded-lg bg-bg text-center text-[12.5px] font-black">プロフィールを編集</Link>
        ) : (
          <>
            <button type="button" onClick={follow} disabled={busy}
              className={`flex-1 py-2 rounded-lg text-[12.5px] font-black ${p.iFollow ? 'bg-bg' : 'bg-orange text-white'}`}>
              {p.mutual ? '相互フォロー ✓' : p.iFollow ? 'フォロー中' : p.followsMe ? 'フォローバック' : 'フォローする'}
            </button>
            {p.mutual && meId ? (
              <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="flex-1 py-2 rounded-lg bg-bg text-center text-[12.5px] font-black">メッセージ</Link>
            ) : (
              <button type="button" onClick={() => toast('相互フォローになるとDMできます')} className="flex-1 py-2 rounded-lg bg-bg text-muted text-[12.5px] font-black">🔒 メッセージ</button>
            )}
            <Link href={`/profile/${u.id}`} aria-label="いまのプロフィール" className="px-3 py-2 rounded-lg bg-bg text-[12.5px] font-black">📝</Link>
          </>
        )}
      </div>

      <div className="flex border-b border-hair mt-4">
        {([['grid', '写真'], ['tagged', 'タグ付け'], ['rounds', '過去参加した\nラウンド'], ['plan', '予定'], ['buddy', '回った仲間']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`flex-1 min-w-0 px-0.5 py-2 text-[11px] leading-tight font-black whitespace-pre-line ${tab === k ? 'border-b-2 border-text text-text' : 'text-muted'}`}>
            {l}{k === 'tagged' && p.isMe && pending.length > 0 && <span className="ml-0.5 inline-block min-w-[15px] px-1 rounded-full bg-orange text-white text-[9.5px]">{pending.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'grid' && p.isMe && (
        <div className="px-3 py-2.5">
          <Link href="/sns/post" className="block py-2.5 rounded-xl bg-orange text-white text-center text-[13px] font-black">📷 写真・動画を投稿する</Link>
        </div>
      )}
      {tab === 'grid' && (p.tiles.length ? (
        <div className="grid grid-cols-3 gap-[2px]">
          {p.tiles.map((t, k) => photoTile(t, k))}
        </div>
      ) : <div className="text-center text-[12px] text-muted py-12">まだ写真がありません</div>)}

      {tab === 'tagged' && (p.isMe ? (
        <div>
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl bg-bg text-[11.5px] font-bold text-sub leading-relaxed">
            あなたがタグ付けされた投稿です。許可したものだけ、プロフィールを見に来た人全員に公開されます。許可しなくても投稿の中のタグは残りますが、あなたのプロフィールには出ません。
          </div>
          {p.tagged.length === 0 && <div className="text-center text-[12px] text-muted py-12">タグ付けされた投稿はありません</div>}
          {pending.length > 0 && <div className="px-3 pt-3.5 pb-1 text-[12px] font-black">まだ許可していない投稿（{pending.length}）</div>}
          {pending.map(tagRow)}
          {approved.length > 0 && <div className="px-3 pt-3.5 pb-1 text-[12px] font-black">プロフィールに公開中（{approved.length}）</div>}
          {approved.map(tagRow)}
        </div>
      ) : p.tagged.length ? (
        <div className="grid grid-cols-3 gap-[2px]">{p.tagged.map((t, k) => photoTile(t, k))}</div>
      ) : <div className="text-center text-[12px] text-muted py-12">タグ付けされた投稿はまだありません</div>)}

      {tab === 'rounds' && (p.pastRounds.length ? (
        <div className="grid grid-cols-3 gap-[2px]">
          {p.pastRounds.map((t, k) => t.photos.length > 0 ? photoTile(t, k, true) : (
            <Link key={t.key} href={p.isMe ? `/sns/post?round=${encodeURIComponent(t.roundId)}` : `/round/${t.roundId}`} className="relative aspect-square overflow-hidden" style={{ background: TILE_BG[k % TILE_BG.length] }}>
              <div className="w-full h-full flex flex-col items-center justify-center text-center px-1.5">
                <div className="text-[22px]">{t.drink ? '🍻' : '⛳'}</div>
                <div className="text-[10.5px] font-black leading-tight mt-1 line-clamp-2">{t.place}</div>
                <div className="text-[9.5px] text-sub mt-0.5">{t.when}</div>
                {p.isMe && <div className="text-[9.5px] font-black text-orange mt-0.5">＋ 写真を追加</div>}
              </div>
            </Link>
          ))}
        </div>
      ) : <div className="text-center text-[12px] text-muted py-12">過去に参加したラウンドはまだありません</div>)}
      {viewing && <PostViewer user={u} tiles={viewerTiles} start={viewing} isMe={p.isMe} onClose={() => setViewing(null)} onDeleted={load} />}

      {tab === 'plan' && (p.upcoming.length ? (
        <div className="px-3 py-2 space-y-2">
          {p.upcoming.map((r) => (
            <Link key={r.roundId} href={`/round/${r.roundId}`} className="block rounded-xl border-2 border-border px-3.5 py-2.5">
              <div className="text-[10.5px] font-black text-orange">{r.host ? '主催' : '参加'}</div>
              <div className="text-[13px] font-black leading-snug">{r.title}</div>
              <div className="text-[11px] text-sub">{r.when}{r.area ? `・${r.area}` : ''}</div>
            </Link>
          ))}
        </div>
      ) : <div className="text-center text-[12px] text-muted py-12">これからの予定はありません</div>)}

      {tab === 'buddy' && (p.buddies.length ? (
        <div className="px-3 py-1">
          {p.buddies.map((b) => (
            <Link key={b.user.id} href={`/sns/u/${b.user.id}`} className="flex items-center gap-3 py-2 border-b border-hair last:border-0">
              <Avatar user={b.user as any} size={40} />
              <span className="flex-1 text-[13px] font-black truncate">{b.user.name}</span>
              <span className="text-[11px] font-bold text-sub">{b.n}回一緒</span>
            </Link>
          ))}
        </div>
      ) : <div className="text-center text-[12px] text-muted py-12">まだいません</div>)}

      <div className="text-center text-[10.5px] text-muted px-6 pt-5 leading-relaxed">
        テスト版：あなたにしか見えません。フォローと投稿・タグ付けの許可はテスト版の中だけの記録で、ほかの会員には伝わりません。
      </div>
    </div>
  );
}
