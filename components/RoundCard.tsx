'use client';

import { RoundChatNewBadge } from '@/components/RoundChatNewBadge';
import Link from 'next/link';
import type { Round, User } from '@/lib/types';
import { useStore, getMe } from '@/lib/store';
import { useUnreadCounts } from '@/lib/useUnread';
import { formatDate, priceLabelForGender } from '@/lib/utils';
import { viewerSlotFull } from '@/lib/genderSlots';
import { countedMemberIds } from '@/lib/hostCount';
import { isPrivateRound } from '@/lib/roundAccess';
import { isEventRound, eventKindMeta } from '@/lib/eventRound';

// コンパクトな募集カード。投稿者名は表示しない。参加状況バーの上に男女比を出す。
export function RoundCard({ round }: { round: Round; host?: User }) {
  const { unreadRoundIds } = useUnreadCounts();
  const users = useStore((s) => s.users);
  const me = useStore(getMe);
  const hasUnread = unreadRoundIds.has(round.id);
  // 「📥 申請 N」は主催者・共同管理者だけに出す（申請中・保留中は主催者だけが見るもの・2026-10-17 本人指定）
  const amHost = !!me?.id && (round.hostId === me.id || (round.coHostIds || []).includes(me.id));
  const pendingN = amHost ? (round.pendingApplicantIds || []).length : 0;
  const isDrink = round.eventType === 'drink';
  // 非公開の招待・イベント（eventKind あり）（2026-10-14）。従来の飲み会（eventKind なし）は今までどおり
  const isPrivate = isPrivateRound(round);
  const isEvent = isEventRound(round);
  const eventMeta = isEvent ? eventKindMeta(round.eventKind) : null;
  const datePending = isEvent && !!round.eventDatePending && (round.eventDateOptions || []).length > 0;
  const eventCap = isEvent && (round.maxSpots || 99) < 99;
  // 飲み会は定員なしで maxSpots が大きくなるが、コンペ扱い（色/バッジ）にはしない。
  const isComp = !isDrink && round.maxSpots >= 5;
  const dateLabel = datePending
    ? `日程調整中（候補${(round.eventDateOptions || []).length}日）`
    : round.dateType === 'range' ? round.dateRange : formatDate(round.date);
  const placeLabel = isDrink
    ? `${round.venue || ''}${round.venue && round.area ? '（' + round.area + '）' : round.area || ''}`
    : round.type === 'confirmed'
      ? `${round.courseName || ''}${round.area ? `（${round.area}）` : ''}`
      : round.area;
  const placeIcon = isEvent ? '📍' : isDrink ? '🍻' : round.type === 'confirmed' ? '⛳' : '📍';
  const placeFallback = isDrink ? '場所未定' : round.type === 'confirmed' ? 'コース調整中' : 'コース未定';
  const pickup = round.pickupStations || [];
  // 費用は閲覧者の性別に応じて表示（男女別料金が設定されている場合）。
  const priceLabel = priceLabelForGender(round, me?.gender);

  // 参加確定メンバーの男女内訳（主催者＋承認済み＋知り合い枠）。公式募集は主催者を数えない（2026-10-12）。
  let male = round.externalMale || 0;
  let female = round.externalFemale || 0;
  for (const id of countedMemberIds(round)) {
    const u = users.find((x) => x.id === id);
    if (u?.gender === 'male') male++;
    else if (u?.gender === 'female') female++;
  }

  const pct = Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100);
  // 飲み会は定員なし → 満員表示・進捗バーは出さず、参加人数だけ表示する。
  const isFull = !isDrink && round.currentCount >= round.maxSpots;
  // 自分の性別の枠だけ満員（全体はまだ空きがある）：札を付けて少し薄く。女性には普通の募集に見える（2026-10-07）
  const mineFullG = viewerSlotFull(round, users, me?.gender);
  const mineFull = !isFull && !!mineFullG;

  return (
    <Link
      href={`/round/${round.id}`}
      className="relative block bg-card rounded-card p-3 mb-2 shadow-card cursor-pointer overflow-hidden"
      style={isFull ? { borderLeft: '5px solid #B9B4A8' } : mineFull ? { borderLeft: '5px solid #C9A24A' } : round.isOfficial ? { borderLeft: '5px solid #2A8C82' } : isComp ? { borderLeft: '5px solid #E8643C' } : undefined}
    >
      {/* 満員は中身をグレーアウト＋「満員」を中央に大きく重ねる。背後は通常の投稿。 */}
      {mineFull && (
        <span className="absolute top-2 right-2 z-10 px-2 py-[2px] rounded-full text-[10px] font-black" style={{ background: '#FFF1C9', color: '#8A5A00', border: '1px solid #C9A24A' }}>
          {mineFullG === 'male' ? '👨 男性枠 満員' : '👩 女性枠 満員'}
        </span>
      )}
      <div className={isFull ? 'grayscale opacity-40' : mineFull ? 'opacity-75' : ''}>
      {(round.isOfficial || isComp || isDrink || isPrivate || pendingN > 0 || hasUnread) && (
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {round.isOfficial && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-black bg-green text-white">✓ ゴルトモ公式</span>
          )}
          {isPrivate && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-black" style={{ background: '#1F3D2B', color: '#F0CF63' }}>✉️ 非公開の招待</span>
          )}
          {isEvent ? (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-black" style={{ background: '#EFEAFF', color: '#7B5CD6', border: '1px solid #7B5CD6' }}>{eventMeta?.emoji} {eventMeta?.label}</span>
          ) : isDrink && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-orange text-white">🍻 飲み会</span>
          )}
          {isComp && !isDrink && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-orange text-white">🏆 コンペ</span>
          )}
          {pendingN > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] font-bold bg-orange-light text-orange border border-orange">📥 申請 {pendingN}</span>
          )}
          {hasUnread && <RoundChatNewBadge roundId={round.id} variant="pill" />}
        </div>
      )}

      {/* 日付 → コース名（県）→ タイトル（金額は男女比の行の左に表示） */}
      <div className="text-[14px] font-black" style={datePending ? { color: '#7B5CD6' } : undefined}>📅 {dateLabel}</div>
      <div className="text-[12px] font-bold text-sub mt-0.5">{placeIcon} {placeLabel || placeFallback}</div>
      <div className="text-[14px] font-black leading-snug mt-0.5">{round.title}</div>

      {/* ピックアップ（あれば1行で簡潔に） */}
      {!isComp && pickup.length > 0 && (
        <div className="mt-1.5 text-[11px] font-bold text-green">🚗 ピックアップ：{pickup.join('・')}{round.pickupCapacity ? `（自分含め${round.pickupCapacity}名）` : ''}</div>
      )}

      {/* 参加費（左）＋男女比 → 参加状況バー */}
      <div className="mt-2 flex items-center gap-2.5 text-[11px] font-bold">
        {priceLabel && <span className="text-orange whitespace-nowrap">参加費 {priceLabel}</span>}
        <span className="text-sub">👨 男性 {male} ・ 👩 女性 {female}</span>
      </div>
      {isDrink ? (
        <div className="flex items-center justify-end mt-1">
          <span className="text-[12px] font-black whitespace-nowrap" style={{ color: isEvent ? '#7B5CD6' : '#E8643C' }}>
            {isEvent ? (eventCap ? `参加${round.currentCount}人／定員${round.maxSpots}人` : `${eventMeta?.emoji} 参加${round.currentCount}人`) : `🍻 ${round.currentCount}人 参加`}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-2 bg-bg rounded overflow-hidden border border-hair">
            <div className="h-full bg-orange rounded" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-black text-orange whitespace-nowrap">{round.currentCount}/{round.maxSpots}人</span>
        </div>
      )}
      {mineFull && (
        <div className="mt-1.5 text-[10px] font-black" style={{ color: '#8A5A00' }}>🔔 空きが出たら参加したい → 詳細で登録できます</div>
      )}
      </div>
      {isFull && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span style={{ color: '#E01E1E', fontWeight: 900, fontSize: '30px', letterSpacing: '6px', textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 2px 6px rgba(0,0,0,.15)' }}>満員</span>
        </div>
      )}
    </Link>
  );
}
