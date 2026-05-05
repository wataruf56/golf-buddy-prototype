'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { getMe, useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import type { Review } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function MyPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const meId = useStore((s) => s.meId);
  const myRounds = useStore((s) =>
    s.rounds.filter((r) =>
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.pendingApplicantIds || []).includes(s.meId)
    )
  );
  const [myReviews, setMyReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!meId) return;
    fetch(`/api/reviews?userId=${encodeURIComponent(meId)}`)
      .then((r) => r.json())
      .then((d) => setMyReviews(d.reviews || []))
      .catch(() => {});
  }, [meId]);

  function logout() {
    if (isDemo) router.push('/login');
    else signOut({ callbackUrl: '/login' });
  }

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">マイページ</div>

      <div className="px-5">
        <div className="bg-card rounded-card p-5 shadow-card mb-4">
          <div className="flex items-center gap-3.5 mb-4">
            <Avatar user={me} size={64} />
            <div>
              <div className="text-lg font-black">{me.displayName}</div>
              <div className="text-xs text-sub">
                {[me.age ? `${me.age}歳` : null, me.scoreRange ? `スコア ${me.scoreRange}` : null].filter(Boolean).join(' ・ ') || '—'}
              </div>
              <div className="text-xs text-sub">
                {[me.area || null, me.playStyle || null, me.frequency || null].filter(Boolean).join(' ・ ') || 'プロフィールを編集してください'}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Stat value={`★${me.reviewAvg}`} label="平均レビュー" color="text-green" />
            <Stat value={`${me.roundCount}回`} label="ラウンド" />
            <Stat value="0回" label="ドタキャン" />
          </div>
        </div>

        <div className="bg-card rounded-card p-4 shadow-card mb-4">
          <div className="text-[13px] font-bold mb-2.5">ラウンド履歴 / 参加中</div>
          {myRounds.length === 0 ? (
            <div className="text-xs text-muted py-3 text-center">まだラウンドがありません</div>
          ) : myRounds.map((r) => {
            const role = r.hostId === me.id
              ? '主催'
              : r.applicantIds.includes(me.id) ? '参加確定'
              : (r.pendingApplicantIds || []).includes(me.id) ? '承認待ち'
              : '参加';
            return (
              <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-2.5 bg-bg rounded-[10px] mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{r.title}</div>
                  <div className="text-[11px] text-muted">{formatDate(r.date) || r.dateRange} ・ {role}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-green-light text-green' : r.status === 'completed' ? 'bg-blue-light text-blue' : 'bg-bg text-sub'}`}>
                  {r.status === 'open' ? '募集中' : r.status === 'completed' ? '完了' : '終了'}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="bg-card rounded-card p-4 shadow-card mb-4">
          <div className="text-[13px] font-bold mb-2.5">自分へのレビュー</div>
          {myReviews.length === 0 ? (
            <div className="text-xs text-muted py-3 text-center">まだレビューがありません</div>
          ) : myReviews.map((rv) => (
            <div key={rv.id} className="p-2.5 bg-bg rounded-[10px] mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-muted">匿名レビュー</span>
                <span className="text-[13px] text-yellow">{'★'.repeat(rv.stars)}{'☆'.repeat(5 - rv.stars)}</span>
              </div>
              {rv.comment && <div className="text-[13px]">{rv.comment}</div>}
            </div>
          ))}
        </div>

        <Link href="/mypage/edit" className="bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card">
          <span className="text-sm font-medium">プロフィール編集</span>
          <span className="text-muted">›</span>
        </Link>
        {['通知設定', '利用規約'].map((item) => (
          <div key={item} className="bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card cursor-pointer">
            <span className="text-sm font-medium">{item}</span>
            <span className="text-muted">›</span>
          </div>
        ))}
        <button onClick={logout} className="w-full bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card text-left">
          <span className="text-sm font-medium text-red">ログアウト</span>
          <span className="text-muted">›</span>
        </button>
      </div>
      <div className="h-5" />
    </>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex-1 bg-bg rounded-[10px] p-3 text-center">
      <div className={`text-xl font-black ${color || ''}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
