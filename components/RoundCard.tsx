'use client';

import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { useStore, getMe } from '@/lib/store';
import { useUnreadCounts } from '@/lib/useUnread';
import { formatDate, priceLabelForGender } from '@/lib/utils';

// コンパクトな募集カード。投稿者名は表示しない。参加状況バーの上に男女比を出す。
export function RoundCard({ round }: { round: Round; host?: User }) {
  const { unreadRoundIds } = useUnreadCounts();
  const users = useStore((s) => s.users);
  const me = useStore(getMe);
  const hasUnread = unreadRoundIds.has(round.id);
  const isComp = round.maxSpots >= 5;
  const dateLabel = round.dateType === 'range' ? round.dateRange : formatDate(round.date);
  const placeLabel = round.type === 'confirmed'
    ? `${round.courseName || ''}${round.area ? `（${round.area}）` : ''}`
    : round.area;
  const placeIcon = round.type === 'confirmed' ? '⛳' : '📍';
  const pickup = round.pickupStations || [];
  // 費用は閲覧者の性別に応じて表示（男女別料金が設定されている場合）。
  const priceLabel = priceLabelForGender(round, me?.gender);

  // 参加確定メンバーの男女内訳（主催者＋承認済み＋知り合い枠）。
  let male = round.externalMale || 0;
  let female = round.externalFemale || 0;
  for (const id of [round.hostId, ...(round.applicantIds || [])]) {
    const u = users.find((x) => x.id === id);
    if (u?.gender === 'male') male++;
    else if (u?.gender === 'female') female++;
  }

  const pct = Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100);

  return (
    <Link
      href={`/round/${round.id}`}
      className="block bg-card rounded-card p-3 mb-2 shadow-card cursor-pointer"
      style={round.isOfficial ? { borderLeft: '5px solid #2A8C82' } : isComp ? { borderLeft: '5px solid #E8643C' } : undefined}
    >
      {(round.isOfficial || isComp || (round.pendingApplicantIds || []).length > 0 || hasUnread) && (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {round.isOfficial && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-black bg-green text-white">✓ ゴルトモ公式</span>
          )}
          {isComp && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-orange text-white">🏆 コンペ</span>
          )}
          {(round.pendingApplicantIds || []).length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-orange-light text-orange border border-orange">📥 申請 {(round.pendingApplicantIds || []).length}</span>
          )}
          {hasUnread && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-red text-white">💬 新着</span>
          )}
        </div>
      )}

      {/* 日付＋金額（1行）→ コース名（県）→ タイトル */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-black">📅 {dateLabel}{round.startTime ? ` ${round.startTime}` : ''}</span>
        {priceLabel && <span className="text-[13px] font-black text-orange whitespace-nowrap">💰{priceLabel}</span>}
      </div>
      <div className="text-[12px] font-bold text-sub mt-0.5">{placeIcon} {placeLabel || (round.type === 'confirmed' ? 'コース調整中' : 'コース未定')}</div>
      <div className="text-[14px] font-black leading-snug mt-0.5">{round.title}</div>

      {/* ピックアップ（あれば1行で簡潔に） */}
      {!isComp && pickup.length > 0 && (
        <div className="mt-1.5 text-[11px] font-bold text-green">🚗 ピックアップ：{pickup.join('・')}{round.pickupCapacity ? `（自分含め${round.pickupCapacity}名）` : ''}</div>
      )}

      {/* 男女比 → 参加状況バー */}
      <div className="mt-2 text-[11px] font-bold text-sub">👨 男性 {male} ・ 👩 女性 {female}</div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-2 bg-bg rounded overflow-hidden border border-hair">
          <div className="h-full bg-orange rounded" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[12px] font-black text-orange whitespace-nowrap">{round.currentCount}/{round.maxSpots}人</span>
      </div>
    </Link>
  );
}
