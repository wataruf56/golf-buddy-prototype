'use client';

import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { formatDate } from '@/lib/utils';

export function RoundCard({ round, host }: { round: Round; host?: User }) {
  const isComp = round.maxSpots >= 5;
  const remaining = round.maxSpots - round.currentCount;
  const pct = Math.round((round.currentCount / round.maxSpots) * 100);
  const dateLabel = round.dateType === 'range' ? round.dateRange : formatDate(round.date);
  const placeLabel = round.type === 'confirmed' ? round.courseName : round.area;
  const placeIcon = round.type === 'confirmed' ? '⛳' : '📍';

  return (
    <Link
      href={`/round/${round.id}`}
      className="block bg-card rounded-card p-4 mb-2.5 shadow-card cursor-pointer"
      style={isComp ? { borderLeft: '4px solid #E67E22' } : undefined}
    >
      {isComp && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <span className="badge inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white">
            🏆 コンペ・イベント
          </span>
        </div>
      )}
      <div className="flex justify-between items-start mb-2.5 gap-2">
        <div className="text-[15px] font-bold flex-1">{round.title}</div>
        {!isComp && (
          <span className="badge inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-green-light text-green flex-shrink-0">
            残り{remaining}枠
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {round.type === 'confirmed' ? (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-green-light text-green">✅ コース確定</span>
        ) : (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-[#EFEFEC] text-sub">📍 コース未定</span>
        )}
        <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-bg text-sub">📅 {dateLabel}</span>
        {round.dateType === 'fixed' && round.startTime && (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-bg text-sub">⏰ {round.startTime}</span>
        )}
        <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-bg text-sub">{placeIcon} {placeLabel}</span>
      </div>
      {isComp && (
        <div className="mb-2.5">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[11px] text-sub font-semibold">参加状況</span>
            <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
          </div>
          <div className="w-full h-2 bg-bg rounded overflow-hidden">
            <div className="h-full bg-orange rounded" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-blue-light text-blue">{round.levelCondition}</span>
        {round.price && (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-yellow-light text-orange">{round.price}</span>
        )}
      </div>
      {host && (
        <div className="flex items-center gap-2 pt-2.5 border-t border-border">
          <Avatar user={host} size={28} />
          <div className="text-xs font-semibold">{host.displayName}</div>
          <div className="text-[11px] text-muted">★{host.reviewAvg}（{host.reviewCount}件）</div>
        </div>
      )}
    </Link>
  );
}
