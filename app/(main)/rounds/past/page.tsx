'use client';

import { RoundChatNewBadge } from '@/components/RoundChatNewBadge';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMe, useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';
import { hostSeat } from '@/lib/hostCount';

// 「過去のラウンド」= 自分が主催 or 参加した完了済みラウンド。開催日（なければ完了時刻）の新しい順。
// 下のタブ「過去ラウンド」とリッチメニュー「過去ラウンド」から開く。
// 2026-10-11：行を押すと、その日のグループチャットへ。写真がある募集は 📷（押すとその募集のアルバム）。
export default function PastRoundsPage() {
  const me = useStore(getMe);
  const { unreadRoundIds } = useUnreadCounts() as any;
  const myRounds = useStore((s) =>
    s.rounds.filter((r) =>
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.coHostIds || []).includes(s.meId)
    )
  );
  const pastRounds = myRounds
    .filter((r) => r.status === 'completed' && !(r as any).availDate)
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    });
  const key = pastRounds.map((r) => r.id).join(',');
  const [photos, setPhotos] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/me/round-photo-counts?ids=${encodeURIComponent(key)}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.counts) setPhotos(j.counts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key]);

  return (
    <>
      <div className="px-5 pt-2 pb-1">
        <div className="text-2xl font-black tracking-tight">🏁 過去のラウンド</div>
        <div className="text-[11px] text-sub mt-0.5">押すと、その日のグループチャットが開きます。📷 はアルバムに写真があるラウンドです。</div>
      </div>

      <div className="px-5 pt-2">
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
          <div className="flex flex-col gap-2">
            {pastRounds.map((r) => {
              const role = r.hostId === me.id ? '主催' : '参加';
              const n = photos[r.id] || 0;
              const people = hostSeat(r) + (r.applicantIds || []).length; // 公式募集は主催者を数えない（2026-10-12）
              const unread = !!(unreadRoundIds && unreadRoundIds.has && unreadRoundIds.has(r.id));
              return (
                <div key={r.id} className="flex items-stretch bg-card rounded-card shadow-card overflow-hidden">
                  <Link href={`/round/${r.id}/chat`} className="flex-1 min-w-0 flex items-center gap-3 p-3.5">
                    <div className="w-11 h-11 rounded-xl bg-green-light flex flex-col items-center justify-center flex-shrink-0 leading-none">
                      <span className="text-[10px] font-bold text-green">{r.date ? `${Number(r.date.slice(5, 7))}月` : ''}</span>
                      <span className="text-[17px] font-black text-green font-num">{r.date ? Number(r.date.slice(8, 10)) : '⛳'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold truncate">{r.title}</div>
                      <div className="text-[11px] text-muted mt-0.5 truncate">{formatDate(r.date) || r.dateRange || '日程未定'} ・ {role} ・ {people}人{r.courseName ? ` ・ ${r.courseName}` : ''}</div>
                    </div>
                    {unread && <RoundChatNewBadge roundId={r.id} />}
                    <span className="text-[18px] flex-shrink-0" aria-hidden>💬</span>
                  </Link>
                  {n > 0 && (
                    <Link href={`/round/${r.id}?tab=album`} aria-label={`アルバム（写真${n}枚）`}
                      className="flex flex-col items-center justify-center px-3 border-l-2 border-border bg-orange-light flex-shrink-0">
                      <span className="text-[20px] leading-none">📷</span>
                      <span className="text-[10px] font-black text-orange mt-0.5">{n}枚</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="h-5" />
    </>
  );
}
