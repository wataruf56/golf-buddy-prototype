'use client';

import { RoundChatNewBadge } from '@/components/RoundChatNewBadge';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMe, useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import { useUnreadCounts } from '@/lib/useUnread';
import { hostSeat } from '@/lib/hostCount';

// 過去のラウンドの一覧（自分が主催 or 参加した完了済み・開催日の新しい順）。行を押すとその日のグループチャット、📷はアルバム。
// /rounds/past とマイページ（2026-10-17・下のタブ「過去ラウンド」をマイページへ移した）で共通。
export function usePastRounds() {
  return useStore((s) =>
    s.rounds.filter((r) =>
      (r.hostId === s.meId || r.applicantIds.includes(s.meId) || (r.coHostIds || []).includes(s.meId))
      && r.status === 'completed' && !(r as any).availDate,
    ).slice().sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    }),
  );
}

export function PastRoundsList() {
  const me = useStore(getMe);
  const { unreadRoundIds } = useUnreadCounts() as any;
  const pastRounds = usePastRounds();
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

  if (pastRounds.length === 0) {
    return (
      <div className="bg-bg rounded-card p-6 text-center">
        <div className="text-3xl mb-2">📖</div>
        <div className="text-sm font-bold mb-1">完了したラウンドはまだありません</div>
        <div className="text-xs text-muted mb-4">ラウンドが終わると、ここに記録が残ります。</div>
        <div className="flex gap-2 justify-center">
          <Link href="/search" className="px-4 py-2 bg-green text-white rounded-full text-xs font-bold">🔍 さがす</Link>
          <Link href="/rounds/upcoming" className="px-4 py-2 bg-card border-[1.5px] border-border rounded-full text-xs font-bold">📅 参加予定</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {pastRounds.map((r) => {
        const role = r.hostId === me.id ? '主催' : '参加';
        const n = photos[r.id] || 0;
        const people = hostSeat(r) + (r.applicantIds || []).length; // 公式募集は主催者を数えない（2026-10-12）
        const unread = !!(unreadRoundIds && unreadRoundIds.has && unreadRoundIds.has(r.id));
        return (
          <div key={r.id} className="flex items-stretch bg-card rounded-card shadow-card overflow-hidden border border-border">
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
  );
}
