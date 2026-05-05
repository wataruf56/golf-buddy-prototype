'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';

export default function BuddiesPage() {
  const meId = useStore((s) => s.meId);
  const chats = useStore((s) => s.chats);
  const users = useStore((s) => s.users);

  const buddies = chats
    .filter((c) => c.participants.includes(meId))
    .map((c) => {
      const otherId = c.participants.find((p) => p !== meId)!;
      const other = users.find((u) => u.id === otherId);
      return { chat: c, other };
    })
    .filter((b) => b.other);

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
            const unread = chat.unreadCount[meId] || 0;
            return (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className="block bg-card rounded-card p-4 shadow-card mb-2.5"
              >
                <div className="flex items-center gap-3">
                  <Avatar user={other} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold">{other.displayName}</span>
                      <span className="text-[11px] text-green font-bold">★{other.reviewAvg}</span>
                    </div>
                    <div className="text-xs text-sub mt-0.5 truncate">{chat.lastMessage}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-muted">{new Date(chat.lastMessageAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}</div>
                    {unread > 0 && (
                      <div className="inline-block mt-1 px-1.5 py-0.5 bg-orange text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{unread}</div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
      <div className="h-5" />
    </>
  );
}
