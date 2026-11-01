'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { SnsTestBadge, type SnsUser } from '@/components/sns/SnsParts';
import { toast } from '@/components/Toast';

// フォロー・フォロワーの一覧（テスト版・運営だけ・2026-11-01 本人指定「インスタと同じ」）。
// タブ：共通（この人をフォローしている人のうち、自分もフォローしている人・自分以外を見たときだけ）／フォロワー／フォロー中。
// 行ごとにフォローのボタン（テスト版だけの記録・snsTestFollows）。
type Row = { user: SnsUser; isMe: boolean; iFollow: boolean; followsMe: boolean };
type Data = { user: { id: string; name: string }; isMe: boolean; mutual: Row[]; followers: Row[]; following: Row[] };
type Tab = 'mutual' | 'followers' | 'following';

export default function SnsFollowsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const search = useSearchParams();
  const [d, setD] = useState<Data | null | 'none'>(null);
  const [tab, setTab] = useState<Tab>('followers');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const load = () => fetch(`/api/sns/user/${encodeURIComponent(params.id)}/follows`, { cache: 'no-store', credentials: 'include' })
    .then((r) => (r.ok ? r.json() : 'none')).then(setD).catch(() => setD('none'));
  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = search?.get('tab');
    if (t === 'mutual' || t === 'followers' || t === 'following') setTab(t);
  }, [search]);
  if (d === 'none') return <div className="text-center text-[13px] text-muted py-20">ページが見つかりません</div>;
  if (!d) return <div className="text-center text-[12px] text-muted py-20">読み込み中...</div>;

  const tabs: [Tab, string, number][] = [
    ...(!d.isMe ? [['mutual', '共通', d.mutual.length] as [Tab, string, number]] : []),
    ['followers', 'フォロワー', d.followers.length],
    ['following', 'フォロー中', d.following.length],
  ];
  const cur = tab === 'mutual' && d.isMe ? 'followers' : tab;
  const kw = q.trim().toLowerCase();
  const rows = d[cur].filter((r) => !kw || r.user.name.toLowerCase().includes(kw));

  async function follow(r: Row) {
    if (busy) return;
    setBusy(r.user.id);
    try {
      const res = await fetch('/api/sns/follow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ userId: r.user.id, on: !r.iFollow }) });
      if (!res.ok) throw new Error();
      toast(!r.iFollow ? 'フォローしました（テスト版）' : 'フォローを外しました（テスト版）');
      await load();
    } catch { toast('うまくいきませんでした', 'error'); }
    setBusy('');
  }

  return (
    <div className="pb-8 bg-card min-h-screen">
      <div className="sticky top-0 z-20 bg-card">
        <div className="flex items-center px-3 h-12 border-b border-hair">
          <button type="button" onClick={() => router.back()} aria-label="戻る" className="w-8 h-8 text-[20px]">‹</button>
          <span className="text-[16px] font-black truncate">{d.user.name}</span><SnsTestBadge />
        </div>
        <div className="flex border-b border-hair">
          {tabs.map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`flex-1 py-2.5 text-[12.5px] font-black ${cur === k ? 'border-b-2 border-text text-text' : 'text-muted'}`}>{n} {l}</button>
          ))}
        </div>
      </div>
      <div className="px-3 pt-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" className="w-full px-3 py-2 rounded-xl bg-bg text-[13px] outline-none" />
      </div>
      {cur === 'mutual' && <div className="px-4 pt-2 text-[11px] text-sub">{d.user.name}さんをフォローしている人のうち、あなたもフォローしている人</div>}
      {rows.length === 0 ? (
        <div className="text-center text-[12px] text-muted py-14">{kw ? '見つかりませんでした' : cur === 'mutual' ? '共通の人はいません' : 'まだいません'}</div>
      ) : rows.map((r) => (
        <div key={r.user.id} className="flex items-center gap-3 px-4 py-2">
          <Link href={r.isMe ? '/sns/u/me' : `/sns/u/${r.user.id}`}><Avatar user={r.user as any} size={46} /></Link>
          <Link href={r.isMe ? '/sns/u/me' : `/sns/u/${r.user.id}`} className="flex-1 min-w-0">
            <div className="text-[13.5px] font-black truncate">{r.user.name}{r.isMe && <span className="text-[11px] text-muted font-bold ml-1">（あなた）</span>}</div>
            <div className="text-[11px] text-sub truncate">{[r.user.age ? `${r.user.age}歳` : '', r.user.area || ''].filter(Boolean).join('・')}{!r.isMe && r.followsMe ? <span className="ml-1 text-green font-bold">あなたをフォロー</span> : null}</div>
          </Link>
          {!r.isMe && (
            <button type="button" disabled={busy === r.user.id} onClick={() => follow(r)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-black flex-shrink-0 ${r.iFollow ? 'bg-bg' : 'bg-orange text-white'}`}>
              {r.iFollow ? (r.followsMe ? '相互フォロー' : 'フォロー中') : (r.followsMe ? 'フォローバック' : 'フォローする')}
            </button>
          )}
        </div>
      ))}
      <div className="text-center text-[10.5px] text-muted px-6 pt-5 leading-relaxed">テスト版：フォローはテスト版の中だけの記録で、相手には伝わりません。</div>
    </div>
  );
}
