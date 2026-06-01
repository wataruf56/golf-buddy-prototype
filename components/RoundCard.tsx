'use client';

import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { useUnreadCounts } from '@/lib/useUnread';
import { useStore } from '@/lib/store';
import { formatDate } from '@/lib/utils';
import { levelConditionLabel } from '@/lib/roundEligibility';

export function RoundCard({ round, host }: { round: Round; host?: User }) {
  const { unreadRoundIds } = useUnreadCounts();
  const allUsers = useStore((s) => s.users);
  // Aggregate male / female counts across host + approved applicants.
  const participantIds = [round.hostId, ...(round.applicantIds || [])];
  let maleCount = 0, femaleCount = 0, otherCount = 0;
  for (const uid of participantIds) {
    const u = allUsers.find((x) => x.id === uid);
    if (!u) continue;
    if (u.gender === 'male') maleCount++;
    else if (u.gender === 'female') femaleCount++;
    else otherCount++;
  }
  const conditionLabel = levelConditionLabel(round);
  const hasUnread = unreadRoundIds.has(round.id);
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
      {(round.isOfficial || isComp || (round.pendingApplicantIds || []).length > 0 || hasUnread) && (
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {round.isOfficial && (
            <span className="badge inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-black bg-green text-white">
              ✓ ゴルトモ公式
            </span>
          )}
          {isComp && (
            <span className="badge inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white">
              🏆 コンペ・イベント
            </span>
          )}
          {(round.pendingApplicantIds || []).length > 0 && (
            <span className="badge inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange-light text-orange border border-orange">
              📥 申請 {(round.pendingApplicantIds || []).length}件
            </span>
          )}
          {hasUnread && (
            <span className="badge inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-red text-white">
              💬 新着メッセージ
            </span>
          )}
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
        <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-blue-light text-blue">{conditionLabel}</span>
        {round.price && (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-yellow-light text-orange">{round.price}</span>
        )}
      </div>

      {/* Gender breakdown of current participants (host + approved applicants).
          Helps applicants see at a glance if they'd be the lone outlier
          before tapping in. */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className="px-2 py-[2px] rounded-md text-[10px] font-bold bg-blue-light text-blue">👨 男 {maleCount}</span>
        <span className="px-2 py-[2px] rounded-md text-[10px] font-bold bg-pink-100 text-pink-600">👩 女 {femaleCount}</span>
        {otherCount > 0 && (
          <span className="px-2 py-[2px] rounded-md text-[10px] font-bold bg-bg text-sub">未設定 {otherCount}</span>
        )}
      </div>
      {round.isOfficial ? (
        <div className="flex items-center gap-2 pt-2.5 border-t border-border">
          <OfficialAvatar size={28} />
          <div className="text-xs font-black">ゴルトモ公式</div>
          <OfficialBadge />
        </div>
      ) : host ? (
        <div className="flex items-center gap-2 pt-2.5 border-t border-border">
          <Avatar user={host} size={28} />
          <div className="text-xs font-semibold">{host.displayName}</div>
          <div className="text-[11px] text-muted">★{host.reviewAvg}（{host.reviewCount}件）</div>
        </div>
      ) : null}
    </Link>
  );
}
