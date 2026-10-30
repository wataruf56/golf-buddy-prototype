'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { RingAvatar, SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';
import { chatIdFor } from '@/lib/utils';

// インスタ風プロフィールのテスト版（2026-10-31 本人指定・運営だけ・lib/snsTest）。
// 数字は「ラウンド／フォロワー／フォロー」。DM は相互フォローのときだけ押せる。
// フォロー／解除はテスト版だけの記録（snsTestFollows）に入る。既存の友達・DMの範囲は変わらない。
type Profile = {
  user: SnsUser & { bio: string; scoreRange: string; playStyle: string; golfHistory: string; golmotiName: string };
  isMe: boolean;
  stats: { rounds: number; followers: number; following: number };
  iFollow: boolean; followsMe: boolean; mutual: boolean;
  known: string[]; knownMore: number;
  tiles: { roundId: string; photo?: string; place: string; when: string; drink: boolean; count: number }[];
  upcoming: { roundId: string; title: string; when: string; area: string; host: boolean }[];
  buddies: { user: SnsUser; n: number }[];
};

const TILE_BG = ['#DCEFEA', '#FCE6DD', '#E8EEF8', '#FFF1D6', '#EDE9F8', '#E4F2DC'];

export default function SnsProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [p, setP] = useState<Profile | null | 'none'>(null);
  const [tab, setTab] = useState<'grid' | 'plan' | 'buddy'>('grid');
  const [busy, setBusy] = useState(false);
  const [meId, setMeId] = useState('');
  const load = () => fetch(`/api/sns/user/${encodeURIComponent(params.id)}`, { cache: 'no-store', credentials: 'include' })
    .then((r) => (r.ok ? r.json() : 'none')).then(setP).catch(() => setP('none'));
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
          <div><div className="text-[17px] font-black">{p.stats.followers}</div><div className="text-[11px] text-sub">フォロワー</div></div>
          <div><div className="text-[17px] font-black">{p.stats.following}</div><div className="text-[11px] text-sub">フォロー</div></div>
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
        {u.bio && <div className="whitespace-pre-wrap">{u.bio}</div>}
        {!p.isMe && p.known.length > 0 && (
          <div className="text-[11.5px] text-sub mt-1">{p.known.join('、')}{p.knownMore ? ` ほか${p.knownMore}人` : ''}がフォロー中</div>
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
        {([['grid', '▦ 写真'], ['plan', '🚩 予定'], ['buddy', '👥 回った仲間']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`flex-1 py-2.5 text-[12px] font-black ${tab === k ? 'border-b-2 border-text text-text' : 'text-muted'}`}>{l}</button>
        ))}
      </div>

      {tab === 'grid' && (p.tiles.length ? (
        <div className="grid grid-cols-3 gap-[2px]">
          {p.tiles.map((t, k) => (
            <Link key={t.roundId} href={`/round/${t.roundId}`} className="relative aspect-square overflow-hidden" style={{ background: TILE_BG[k % TILE_BG.length] }}>
              {t.photo ? (
                <img src={t.photo} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center px-1.5">
                  <div className="text-[22px]">{t.drink ? '🍻' : '⛳'}</div>
                  <div className="text-[10.5px] font-black leading-tight mt-1 line-clamp-2">{t.place}</div>
                  <div className="text-[9.5px] text-sub mt-0.5">{t.when}</div>
                </div>
              )}
              {t.count > 1 && <span className="absolute right-1 top-1 text-white text-[11px] drop-shadow">❐</span>}
            </Link>
          ))}
        </div>
      ) : <div className="text-center text-[12px] text-muted py-12">まだラウンドの記録がありません</div>)}

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
        テスト版：あなたにしか見えません。フォローはテスト版の中だけの記録で、相手には伝わりません。
      </div>
    </div>
  );
}
