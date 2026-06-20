'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { chatIdFor, ratingLabel } from '@/lib/utils';

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
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const chats = useStore((s) => s.chats);
  const users = useStore((s) => s.users);
  const buddyIds = useStore((s) => s.buddyIds);
  const blocked = new Set(me.blockedUserIds || []);

  const initTab = (search?.get('tab') as 'buddies' | 'romantic' | 'again') || 'buddies';
  const [tab, setTab] = useState<'buddies' | 'romantic' | 'again'>(initTab);
  const [matches, setMatches] = useState<Record<string, MatchInfo>>({});
  const [matchUsers, setMatchUsers] = useState<Record<string, MUser>>({});

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
    return () => { cancelled = true; };
  }, []);

  const buddies = buddyIds
    .filter((id) => !blocked.has(id))
    .map((id) => ({ other: users.find((u) => u.id === id), chat: chats.find((c) => c.id === chatIdFor(meId, id)) }))
    .filter((b) => b.other)
    .sort((a, b) => (b.chat?.lastMessageAt || 0) - (a.chat?.lastMessageAt || 0));

  const romanticIds = Object.keys(matches).filter((id) => matches[id]?.romantic);
  const againIds = Object.keys(matches).filter((id) => matches[id]?.again);

  const tabs = [
    { key: 'buddies' as const, label: '👥 ゴル友', n: buddies.length },
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
              className={'flex-1 py-2 rounded-full text-[12px] font-bold transition-colors ' + (tab === t.key ? 'bg-green text-white' : 'text-sub')}
            >{t.label}{t.n > 0 ? ` ${t.n}` : ''}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-20">
        {tab === 'buddies' && (
          <>
            <div className="text-xs text-sub mb-3">ラウンド後の相互レビューを完了した相手とメッセージができます</div>
            {buddies.length === 0 ? (
              <Empty title="まだゴル友がいません" desc="ラウンドに参加して相互レビューを完了するとゴル友になれます" />
            ) : (
              buddies.map(({ chat, other }) => {
                if (!other) return null;
                const cid = chatIdFor(meId, other.id);
                const unread = chat?.unreadCount[meId] || 0;
                return (
                  <div key={other.id} className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3">
                    <Link href={`/profile/${other.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar user={other} size={48} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[15px] font-bold">{other.displayName}</span>
                          <span className="text-[11px] text-green font-bold">{ratingLabel(other)}</span>
                        </div>
                        {(matches[other.id]?.again || matches[other.id]?.romantic) ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            {matches[other.id]?.romantic && <span className="text-[10px] font-black text-pink-600 bg-pink-100 px-1.5 py-px rounded-full border border-pink-600">💘 マッチ</span>}
                            {matches[other.id]?.again && <span className="text-[10px] font-black text-green bg-green-light px-1.5 py-px rounded-full border border-green">🏌️ また回りたい</span>}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted mt-0.5">タップでプロフィール</div>
                        )}
                      </div>
                    </Link>
                    <Link href={`/chat/${cid}?other=${other.id}`} className="flex items-center gap-2 flex-shrink-0 max-w-[45%]">
                      <div className="text-right min-w-0">
                        <div className="text-xs text-sub truncate">{chat?.lastMessage || 'メッセージ ›'}</div>
                        {unread > 0 && <div className="inline-block mt-1 px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>}
                      </div>
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
            badge="💘 マッチしました" badgeClass="text-pink-600 bg-pink-100 border-pink-600"
            note="「異性として気になる」を双方が選んだ時のみ、ここに相手が追加されます。"
            emptyTitle="まだマッチがいません" emptyDesc="ラウンド後のレビューで「💘 異性として気になる」を送り、相手も同じなら両思い成立！"
          />
        )}

        {tab === 'again' && (
          <MatchList
            ids={againIds} matchUsers={matchUsers} storeUsers={users} meId={meId} chats={chats}
            badge="🏌️ マッチしました" badgeClass="text-green bg-green-light border-green"
            note="「また一緒に回りたい」を双方が選んだ時のみ、ここに相手が追加されます。"
            emptyTitle="まだマッチがいません" emptyDesc="ラウンド後のレビューで「🏌️ また一緒に回りたい」を送り、相手も同じなら両思い成立！"
          />
        )}
      </div>
    </div>
  );
}

function MatchList({ ids, matchUsers, storeUsers, meId, chats, badge, badgeClass, note, emptyTitle, emptyDesc }: {
  ids: string[]; matchUsers: Record<string, MUser>; storeUsers: any[]; meId: string; chats: any[];
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
              <Link href={hasChat ? `/chat/${cid}?other=${id}` : `/profile/${id}`} className="flex-shrink-0 text-lg">💬</Link>
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
