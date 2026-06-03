'use client';

import Link from 'next/link';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { chatIdFor } from '@/lib/utils';

export default function BuddiesPage() {
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const chats = useStore((s) => s.chats);
  const users = useStore((s) => s.users);
  const buddyIds = useStore((s) => s.buddyIds);
  const blocked = new Set(me.blockedUserIds || []);

  // Only mutual-review buddies. Pre-buddy 1on1 chats live in /round/[id] only.
  const buddies = buddyIds
    .filter((id) => !blocked.has(id))
    .map((id) => {
      const other = users.find((u) => u.id === id);
      const chat = chats.find((c) => c.id === chatIdFor(meId, id));
      return { other, chat };
    })
    .filter((b) => b.other)
    .sort((a, b) => (b.chat?.lastMessageAt || 0) - (a.chat?.lastMessageAt || 0));

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">ゴル友</div>
      <div className="px-5">
        <div className="text-xs text-sub mb-4">ラウンド後の相互レビューを完了した相手とメッセージができます</div>
        {buddies.length === 0 ? (
          <div className="text-center py-16 px-5">
            <div className="text-5xl mb-4">⛳</div>
            <div className="text-[15px] font-bold mb-2">まだゴル友がいません</div>
            <div className="text-[13px] text-sub">ラウンドに参加して<br />相互レビューを完了するとゴル友になれます</div>
          </div>
        ) : (
          buddies.map(({ chat, other }) => {
            if (!other) return null;
            const cid = chatIdFor(meId, other.id);
            const unread = chat?.unreadCount[meId] || 0;
            return (
              <div
                key={other.id}
                className="bg-card rounded-card p-4 shadow-card mb-2.5 flex items-center gap-3"
              >
                {/* Avatar + name → straight to the profile. */}
                <Link href={`/profile/${other.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar user={other} size={48} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold">{other.displayName}</span>
                      <span className="text-[11px] text-green font-bold">★{other.reviewAvg}</span>
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">タップでプロフィール</div>
                  </div>
                </Link>
                {/* Message preview / unread → opens the chat. */}
                <Link
                  href={`/chat/${cid}?other=${other.id}`}
                  className="flex items-center gap-2 flex-shrink-0 max-w-[45%]"
                >
                  <div className="text-right min-w-0">
                    <div className="text-xs text-sub truncate">{chat?.lastMessage || 'メッセージ ›'}</div>
                    {chat?.lastMessageAt ? (
                      <div className="text-[10px] text-muted">{new Date(chat.lastMessageAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</div>
                    ) : null}
                    {unread > 0 && (
                      <div className="inline-block mt-1 px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>
                    )}
                  </div>
                  <span className="text-lg flex-shrink-0">💬</span>
                </Link>
              </div>
            );
          })
        )}
      </div>
      <div className="h-5" />
    </>
  );
}
