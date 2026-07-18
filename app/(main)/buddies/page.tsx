'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { chatIdFor } from '@/lib/utils';

type MatchInfo = { again: boolean; romantic: boolean };
type MUser = { displayName: string; avatar?: string; avatarUrl?: string; gender?: string; age?: number };

export default function BuddiesPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const search = useSearchParams();
  const router = useRouter();
  const meId = useStore((s) => s.meId);
  // 「候補日」→ 再会セッションを用意してカレンダーへ（お知らせを待たず直接開始）。
  const [rematchBusy, setRematchBusy] = useState('');
  async function startRematch(partnerId: string) {
    setRematchBusy(partnerId);
    try {
      const r = await fetch('/api/rematch/ensure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId }), cache: 'no-store', credentials: 'include',
      });
      const d = await r.json();
      if (r.ok && d?.pairId) router.push(`/rematch/${d.pairId}`);
      else toast('再会の準備に失敗しました', 'error');
    } catch { toast('通信に失敗しました', 'error'); }
    finally { setRematchBusy(''); }
  }
  const me = useStore(getMe);
  const chats = useStore((s) => s.chats);
  const users = useStore((s) => s.users);
  const blocked = new Set(me.blockedUserIds || []);

  const initTab = (search?.get('tab') as 'past' | 'romantic' | 'again' | 'friends') || 'past';
  const [tab, setTab] = useState<'past' | 'romantic' | 'again' | 'friends'>(initTab);
  const [matches, setMatches] = useState<Record<string, MatchInfo>>({});
  const [matchUsers, setMatchUsers] = useState<Record<string, MUser>>({});
  const [pastIds, setPastIds] = useState<string[]>([]);
  const [pastUsers, setPastUsers] = useState<Record<string, MUser>>({});
  const [pastLoaded, setPastLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/me/matches', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (d?.matches) setMatches(d.matches);
        if (d?.users) setMatchUsers(d.users);
      } catch { /* noop */ }
    })();
    (async () => {
      try {
        const res = await fetch('/api/me/past-partners', { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d?.partners)) setPastIds(d.partners);
        if (d?.users) setPastUsers(d.users);
      } catch { /* noop */ } finally { if (!cancelled) setPastLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  const pastPartners = pastIds.filter((id) => !blocked.has(id));
  const romanticIds = Object.keys(matches).filter((id) => matches[id]?.romantic);
  const againIds = Object.keys(matches).filter((id) => matches[id]?.again);
  // QRコードで直接つながった友達。
  const friendIds = (me.friendIds || []).filter((id) => !blocked.has(id) && id !== meId);

  const tabs = [
    { key: 'friends' as const, label: '🤝 友達', n: friendIds.length },
    { key: 'past' as const, label: '⛳ 一緒に回った人', n: pastPartners.length },
    { key: 'romantic' as const, label: '💘 気になる', n: romanticIds.length },
    { key: 'again' as const, label: '🏌️ また回りたい', n: againIds.length },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-2 pb-3 text-2xl font-black tracking-tight">ゴル友・マッチ</div>

      {/* 上部タブ */}
      <div className="px-5 sticky top-0 bg-bg z-10 pb-2">
        <div className="flex gap-1.5 bg-card rounded-full p-1 shadow-card">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={'flex-1 py-2 rounded-full text-[11px] font-bold transition-colors ' + (tab === t.key ? 'bg-green text-white' : 'text-sub')}
            >{t.label}{t.n > 0 ? ` ${t.n}` : ''}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-20">
        {tab === 'friends' && (
          <>
            <div className="text-xs text-sub mb-3">QRコードで直接つながった友達です。タップでプロフィール・💬でメッセージ。マイページの「QRコードで友達」から追加できます。</div>
            {friendIds.length === 0 ? (
              <Empty title="まだ友達がいません" desc="マイページの「QRコードで友達」から、直接会った人とQRでつながれます" />
            ) : (
              friendIds.map((id) => {
                const u: any = users.find((x) => x.id === id) || matchUsers[id] || pastUsers[id] || { displayName: 'ゴルファー' };
                const cid = chatIdFor(meId, id);
                const chat = chats.find((c) => c.id === cid);
                const unread = chat?.unreadCount[meId] || 0;
                return (
                  <div key={id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
                    <Link href={`/profile/${id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar user={{ id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, color: '#2A8C82' } as any} size={48} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[15px] font-bold truncate">{u.displayName}</span>
                          {u.gender === 'male' ? <span className="text-[11px]">👨</span> : u.gender === 'female' ? <span className="text-[11px]">👩</span> : null}
                          {u.age ? <span className="text-[11px] text-sub font-medium">{u.age}歳</span> : null}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">🤝 QRで繋がった友達</div>
                      </div>
                    </Link>
                    <Link href={`/chat/${cid}?other=${id}`} className="flex items-center gap-2 flex-shrink-0">
                      {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                      <span className="text-lg flex-shrink-0">💬</span>
                    </Link>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'past' && (
          <>
            <div className="text-xs text-sub mb-3">過去に同じ組でラウンドした人の一覧です。タップでプロフィール・💬でメッセージ。</div>
            {pastPartners.length === 0 ? (
              <Empty title={pastLoaded ? 'まだ一緒に回った人がいません' : '読み込み中...'} desc="ラウンドに参加して完了すると、同じ組だった人がここに並びます" />
            ) : (
              pastPartners.map((id) => {
                const u = pastUsers[id] || matchUsers[id] || users.find((x) => x.id === id) || { displayName: 'メンバー' };
                const cid = chatIdFor(meId, id);
                const chat = chats.find((c) => c.id === cid);
                const unread = chat?.unreadCount[meId] || 0;
                return (
                  <div key={id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
                    <Link href={`/profile/${id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar user={{ id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, color: '#2A8C82' } as any} size={48} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[15px] font-bold truncate">{u.displayName}</span>
                          {u.gender === 'male' ? <span className="text-[11px]">👨</span> : u.gender === 'female' ? <span className="text-[11px]">👩</span> : null}
                          {u.age ? <span className="text-[11px] text-sub font-medium">{u.age}歳</span> : null}
                        </div>
                        {(matches[id]?.again || matches[id]?.romantic) ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            {matches[id]?.romantic && <span className="text-[10px] font-black text-pink-600 bg-pink-100 px-1.5 py-px rounded-full border border-pink-600">💘 マッチ</span>}
                            {matches[id]?.again && <span className="text-[10px] font-black text-green bg-green-light px-1.5 py-px rounded-full border border-green">🏌️ また回りたい</span>}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted mt-0.5">タップでプロフィール</div>
                        )}
                      </div>
                    </Link>
                    <Link href={chat ? `/chat/${cid}?other=${id}` : `/profile/${id}`} className="flex items-center gap-2 flex-shrink-0">
                      {unread > 0 && <div className="px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                      <span className="text-lg flex-shrink-0">💬</span>
                    </Link>
                  </div>
                );
              })
            )}
          </>
        )}

        {tab === 'romantic' && (
          <MatchList
            ids={romanticIds} matchUsers={matchUsers} storeUsers={users} meId={meId} chats={chats}
            onRematch={startRematch} rematchBusy={rematchBusy}
            badge="💘 マッチしました" badgeClass="text-pink-600 bg-pink-100 border-pink-600"
            note="「異性として気になる」を双方が選んだ時のみ、ここに相手が追加されます。"
            emptyTitle="まだマッチがいません" emptyDesc="ラウンド後のレビューで「💘 異性として気になる」を送り、相手も同じならマッチ成立！"
          />
        )}

        {tab === 'again' && (
          <MatchList
            ids={againIds} matchUsers={matchUsers} storeUsers={users} meId={meId} chats={chats}
            onRematch={startRematch} rematchBusy={rematchBusy}
            badge="🏌️ マッチしました" badgeClass="text-green bg-green-light border-green"
            note="「また一緒に回りたい」を双方が選んだ時のみ、ここに相手が追加されます。「📅 候補日」から再会の日程調整を始められます。"
            emptyTitle="まだマッチがいません" emptyDesc="ラウンド後のレビューで「🏌️ また一緒に回りたい」を送り、相手も同じならマッチ成立！"
          />
        )}
      </div>
    </div>
  );
}

function MatchList({ ids, matchUsers, storeUsers, meId, chats, onRematch, rematchBusy, badge, badgeClass, note, emptyTitle, emptyDesc }: {
  ids: string[]; matchUsers: Record<string, MUser>; storeUsers: any[]; meId: string; chats: any[];
  onRematch: (id: string) => void; rematchBusy: string;
  badge: string; badgeClass: string; note: string; emptyTitle: string; emptyDesc: string;
}) {
  return (
    <>
      <div className="text-[11px] text-sub bg-card rounded-xl p-3 mb-3 shadow-card leading-relaxed">💡 {note}</div>
      {ids.length === 0 ? (
        <Empty title={emptyTitle} desc={emptyDesc} />
      ) : (
        ids.map((id) => {
          const u = matchUsers[id] || storeUsers.find((x) => x.id === id) || { displayName: 'メンバー' };
          const cid = chatIdFor(meId, id);
          const hasChat = chats.some((c) => c.id === cid);
          return (
            <div key={id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
              <Link href={`/profile/${id}`} className="flex items-center gap-3 min-w-0 flex-1">
                <Avatar user={{ id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, color: '#2A8C82' } as any} size={48} />
                <div className="min-w-0">
                  <div className="text-[15px] font-bold truncate">
                    {u.displayName}
                    {u.gender === 'male' ? ' 👨' : u.gender === 'female' ? ' 👩' : ''}
                    {u.age ? <span className="text-[11px] text-sub font-medium"> {u.age}歳</span> : null}
                  </div>
                  <span className={'inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full border ' + badgeClass}>{badge}</span>
                </div>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onRematch(id)}
                  disabled={rematchBusy === id}
                  className="px-2.5 py-1.5 bg-green text-white rounded-full text-[11px] font-black disabled:opacity-50"
                >{rematchBusy === id ? '…' : '📅 候補日'}</button>
                <Link href={hasChat ? `/chat/${cid}?other=${id}` : `/profile/${id}`} className="text-lg">💬</Link>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="text-center py-16 px-5">
      <div className="text-5xl mb-4">⛳</div>
      <div className="text-[15px] font-bold mb-2">{title}</div>
      <div className="text-[13px] text-sub">{desc}</div>
    </div>
  );
}
