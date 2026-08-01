'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMe, useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

// 「参加予定ラウンド」= 自分が主催 or 参加/申請中で、まだ完了していないラウンド
// （募集中open＋締切closed の両方。参加後に締め切られても残る）。開催日の昇順
// （日程未定は末尾）。リッチメニュー「参加予定」から直接開く一覧ページ。
export default function UpcomingRoundsPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const myRounds = useStore((s) =>
    s.rounds.filter((r) =>
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.pendingApplicantIds || []).includes(s.meId)
    )
  );
  const upcomingRounds = myRounds
    .filter((r) => r.status !== 'completed')
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });

  return (
    <>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">📅 参加予定のラウンド</div>
      </div>

      <div className="px-5">
        {upcomingRounds.length === 0 ? (
          <div className="bg-card rounded-card shadow-card p-8 text-center">
            <div className="text-3xl mb-2">⛳</div>
            <div className="text-sm font-bold mb-1">参加予定のラウンドはありません</div>
            <div className="text-xs text-muted mb-4">気になるラウンドを探して参加してみましょう。</div>
            <div className="flex gap-2 justify-center">
              <Link href="/search" className="px-4 py-2 bg-green text-white rounded-full text-xs font-bold">🔍 さがす</Link>
              <Link href="/create" className="px-4 py-2 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold">✏️ 募集する</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {upcomingRounds.map((r) => {
              const role = r.hostId === me.id
                ? '主催'
                : r.applicantIds.includes(me.id) ? '参加確定'
                : (r.pendingApplicantIds || []).includes(me.id) ? '承認待ち'
                : '参加';
              return (
                <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-3.5 bg-card rounded-card shadow-card">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate">{r.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{formatDate(r.date) || r.dateRange || '日程未定'} ・ {role}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${r.status === 'open' ? 'bg-green-light text-green' : r.status === 'completed' ? 'bg-blue-light text-blue' : 'bg-bg text-sub'}`}>
                    {r.status === 'open' ? '募集中' : r.status === 'completed' ? '完了' : '締切'}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        <button onClick={() => router.push('/home')} className="w-full mt-4 px-5 py-2.5 bg-bg border-[1.5px] border-border rounded-xl text-sm font-bold">
          ホームに戻る
        </button>
      </div>
      <div className="h-5" />
    </>
  );
}
