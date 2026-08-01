'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMe, useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';

// 「過去参加したラウンド」= 自分が主催 or 参加した完了済みラウンド。開催日（なければ
// 完了時刻）の新しい順。ここから当時の詳細（参加者・レビュー等）にまた飛べる。
// リッチメニュー「過去ラウンド」から直接開く一覧ページ。
export default function PastRoundsPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const myRounds = useStore((s) =>
    s.rounds.filter((r) =>
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.pendingApplicantIds || []).includes(s.meId)
    )
  );
  const pastRounds = myRounds
    .filter((r) => r.status === 'completed')
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    });

  return (
    <>
      <div className="px-5 pt-2 pb-3 flex items-center justify-between">
        <div className="text-2xl font-black tracking-tight">🏁 過去のラウンド</div>
      </div>

      <div className="px-5">
        {pastRounds.length === 0 ? (
          <div className="bg-card rounded-card shadow-card p-8 text-center">
            <div className="text-3xl mb-2">📖</div>
            <div className="text-sm font-bold mb-1">完了したラウンドはまだありません</div>
            <div className="text-xs text-muted mb-4">ラウンドが終わると、ここに記録が残ります。</div>
            <div className="flex gap-2 justify-center">
              <Link href="/search" className="px-4 py-2 bg-green text-white rounded-full text-xs font-bold">🔍 さがす</Link>
              <Link href="/rounds/upcoming" className="px-4 py-2 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold">📅 参加予定</Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {pastRounds.map((r) => {
              const role = r.hostId === me.id ? '主催' : '参加';
              return (
                <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-3.5 bg-card rounded-card shadow-card">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate">{r.title}</div>
                    <div className="text-[11px] text-muted mt-0.5">{formatDate(r.date) || r.dateRange || '日程未定'} ・ {role}</div>
                  </div>
                  <span className="text-[11px] text-blue font-bold flex-shrink-0 ml-2">詳細 →</span>
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
