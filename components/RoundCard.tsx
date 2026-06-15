'use client';

import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { useUnreadCounts } from '@/lib/useUnread';
import { formatDate, ratingLabel } from '@/lib/utils';

export function RoundCard({ round, host }: { round: Round; host?: User }) {
  const { unreadRoundIds } = useUnreadCounts();
  const hasUnread = unreadRoundIds.has(round.id);
  const isComp = round.maxSpots >= 5;
  const dateLabel = round.dateType === 'range' ? round.dateRange : formatDate(round.date);
  const placeLabel = round.type === 'confirmed' ? round.courseName : round.area;
  const placeIcon = round.type === 'confirmed' ? '⛳' : '📍';
  const pickup = round.pickupStations || [];

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
      {/* タイトル */}
      <div className="text-[13px] font-bold text-sub mb-1.5">{round.title}</div>

      {/* コース確定/未定 ＋ 大きく：ゴルフ場・日付・金額 */}
      <div className="mb-3">
        {round.type === 'confirmed' ? (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-green-light text-green">✅ コース確定</span>
        ) : (
          <span className="badge px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-[#EFEFEC] text-sub">📍 コース未定</span>
        )}
        <div className="text-[19px] font-black mt-1.5 leading-snug">{placeIcon} {placeLabel}</div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 mt-1">
          <span className="text-[17px] font-black">📅 {dateLabel}</span>
          {round.price && <span className="text-[17px] font-black text-orange">💰 {round.price}</span>}
        </div>
      </div>

      {/* ピックアップ場所（コンペ以外で、主催者がピックアップ可能なら表示） */}
      {!isComp && pickup.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-green-light rounded-lg border-[1.5px] border-green">
          <span className="text-[11px] font-black text-white bg-green px-2 py-px rounded-full mr-1.5">ピックアップ場所</span>
          <span className="text-[12px] font-bold text-green">{pickup.join('・')}{round.pickupCapacity ? `（自分含め${round.pickupCapacity}名）` : ''}</span>
        </div>
      )}

      {/* 参加状況バー */}
      <div className="mb-2.5">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[11px] text-sub font-semibold">参加状況</span>
          <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
        </div>
        <div className="w-full h-2 bg-bg rounded overflow-hidden">
          <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100)}%` }} />
        </div>
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
