'use client';

import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { useUnreadCounts } from '@/lib/useUnread';
import { useStore, store } from '@/lib/store';
import { formatDate, ratingLabel } from '@/lib/utils';
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
      style={isComp ? { borderLeft: '4px solid #E8643C' } : undefined}
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
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isComp && (
            <span className="badge inline-flex items-center px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-green-light text-green">
              残り{remaining}枠
            </span>
          )}
          <InterestHeart round={round} />
        </div>
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
      {/* 参加状況バー（コンペ以外の通常募集でもカード上に表示） */}
      <div className="mb-2.5">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[11px] text-sub font-semibold">参加状況</span>
          <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
        </div>
        <div className="w-full h-2 bg-bg rounded overflow-hidden">
          <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100)}%` }} />
        </div>
      </div>
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
          <div className="text-[11px] text-muted">{ratingLabel(host, { count: true })}</div>
        </div>
      ) : null}
    </Link>
  );
}

// ♡「気になる」heart. Lives inside the card's <Link>, so taps must not navigate.
// Host sees a read-only count; everyone else can toggle their interest.
function InterestHeart({ round }: { round: Round }) {
  const meId = useStore((s) => s.meId);
  const interested = (round.interestedIds || []).includes(meId);
  const count = (round.interestedIds || []).length;
  const isHost = round.hostId === meId;

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isHost) return;
    try { await store.toggleInterest(round.id, !interested); } catch {}
  }

  if (isHost) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-bg text-sub" title="気になる人数">
        <span>{count > 0 ? '❤️' : '🤍'}</span>
        {count > 0 && <span>{count}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      aria-label={interested ? '気になるを解除' : '気になる'}
      className={`inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full text-[11px] font-bold transition-colors ${
        interested ? 'bg-pink-100 text-pink-600' : 'bg-bg text-sub'
      }`}
    >
      <span>{interested ? '❤️' : '🤍'}</span>
      <span>{count > 0 ? count : '気になる'}</span>
    </button>
  );
}
