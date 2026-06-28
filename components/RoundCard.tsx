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
  // 金額表示は「円」を付ける。¥は重複するので除去してから付与。
  const priceRaw = (round.price || '').replace(/[¥￥]/g, '').trim();
  const priceLabel = priceRaw ? (priceRaw.includes('円') ? priceRaw : `${priceRaw}円`) : '';

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
      {/* (a) 日付（左上） → (b) コース名 → (c) タイトル → (d) 金額 */}
      <div className="text-[15px] font-black mb-0.5">📅 {dateLabel}{round.startTime ? ` ${round.startTime}` : ''}</div>
      <div className="text-[13px] font-bold text-sub mb-1">{placeIcon} {placeLabel || (round.type === 'confirmed' ? 'コース調整中' : 'コース未定')}</div>
      <div className="text-[16px] font-black leading-snug mb-1">{round.title}</div>
      {priceLabel && <div className="text-sm font-black text-orange mb-2">💰 {priceLabel}</div>}

      {/* ピックアップ場所（コンペ以外で、主催者がピックアップ可能なら表示） */}
      {!isComp && pickup.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-green-light rounded-lg border-[1.5px] border-green">
          <span className="text-[11px] font-black text-white bg-green px-2 py-px rounded-full mr-1.5">ピックアップ場所</span>
          <span className="text-[12px] font-bold text-green">{pickup.join('・')}{round.pickupCapacity ? `（自分含め${round.pickupCapacity}名）` : ''}</span>
        </div>
      )}

      {/* 参加状況バー */}
      <div className="mt-2.5">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[11px] text-sub font-semibold">参加状況</span>
          <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
        </div>
        <div className="w-full h-2 bg-bg rounded overflow-hidden">
          <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100)}%` }} />
        </div>
      </div>

      {/* (e) 投稿者（枠内の左下に小さく） */}
      <div className="mt-3 pt-2.5 border-t border-border">
        {round.isOfficial ? (
          <div className="flex items-center gap-1.5">
            <OfficialAvatar size={20} />
            <span className="text-[12px] font-bold">ゴルトモ公式</span>
            <OfficialBadge />
          </div>
        ) : host ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={host} size={20} />
            <span className="text-[12px] font-bold">{host.displayName}</span>
            <span className="text-[10px] text-muted">{ratingLabel(host, { count: true })}</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
