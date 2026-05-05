'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import type { Review, User } from '@/lib/types';
import { chatIdFor } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cachedUser = useStore((s) => s.users.find((u) => u.id === params.id));
  const meId = useStore((s) => s.meId);
  const chats = useStore((s) => s.chats);
  const isBuddy = chats.some((c) => c.participants.includes(meId) && c.participants.includes(params.id || ''));

  const [user, setUser] = useState<User | undefined>(cachedUser);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/users/${encodeURIComponent(params.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); if (d.reviews) setReviews(d.reviews); })
      .catch(() => {});
  }, [params.id]);

  if (!user) return <div className="p-5 text-sub">読み込み中...</div>;

  return (
    <div className="px-5 py-3">
      <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-4">← 戻る</button>

      <div className="text-center mb-5">
        <div className="mx-auto mb-3 inline-block">
          <Avatar user={user} size={72} emojiSize={36} />
        </div>
        <div className="text-xl font-black">{user.displayName}</div>
        <div className="text-[13px] text-sub mt-1">{user.age}歳 ・ {user.area}</div>
      </div>

      <div className="flex gap-2 mb-5">
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className="text-2xl font-black text-green">★{user.reviewAvg}</div>
          <div className="text-[10px] text-muted mt-0.5">{user.reviewCount}件のレビュー</div>
        </div>
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className="text-2xl font-black text-blue">{user.scoreRange}</div>
          <div className="text-[10px] text-muted mt-0.5">スコア帯</div>
        </div>
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className="text-2xl font-black">{user.roundCount}</div>
          <div className="text-[10px] text-muted mt-0.5">ラウンド</div>
        </div>
      </div>

      <div className="bg-card rounded-card p-4 shadow-card mb-3">
        <div className="text-[13px] font-bold mb-2.5">プロフィール</div>
        <div className="flex flex-wrap gap-1.5">
          {user.gender && (
            <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">
              {user.gender === 'male' ? '👨 男性' : user.gender === 'female' ? '👩 女性' : '🧑 その他'}
            </span>
          )}
          {user.car && (
            <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">
              {user.car === 'have' ? '🚗 車あり' : '🚶 車なし'}
            </span>
          )}
          {user.playStyle && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">🏌️ {user.playStyle}</span>}
          {user.frequency && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">📅 {user.frequency}</span>}
          {user.area && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">📍 {user.area}</span>}
        </div>
        {user.bio && (
          <div className="mt-3 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed whitespace-pre-wrap">
            {user.bio}
          </div>
        )}
      </div>

      <div className="bg-card rounded-card p-4 shadow-card mb-4">
        <div className="text-[13px] font-bold mb-2.5">レビュー（匿名）</div>
        {reviews.length === 0 ? (
          <div className="text-xs text-muted py-3 text-center">まだレビューがありません</div>
        ) : reviews.map((rv) => (
          <div key={rv.id} className="p-2.5 bg-bg rounded-[10px] mb-2">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-muted">匿名レビュー</span>
              <span className="text-[13px] text-yellow">{'★'.repeat(rv.stars)}{'☆'.repeat(5 - rv.stars)}</span>
            </div>
            {rv.comment && <div className="text-[13px] leading-relaxed">{rv.comment}</div>}
          </div>
        ))}
      </div>

      {user.id === meId ? null : isBuddy ? (
        <Link href={`/chat/${chatIdFor(meId, user.id)}`} className="block w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold text-center">
          メッセージを送る
        </Link>
      ) : (
        <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">
          ラウンド後の相互レビュー完了でメッセージが開放されます
        </div>
      )}
      <div className="h-5" />
    </div>
  );
}
