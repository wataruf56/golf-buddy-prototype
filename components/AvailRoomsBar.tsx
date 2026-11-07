'use client';

import Link from 'next/link';
import { useStore } from '@/lib/store';
import { RoundChatNewBadge } from '@/components/RoundChatNewBadge';
import { AVAIL_ROOM_MIN, dateLabel, isAvailRoom } from '@/lib/availabilityShared';

// 「行ける日」で3人以上そろったチャットへの入口（2026-11-07 本人指定）。
//   ・ホーム・行ける日・さがす・タイムライン・マイページの一番上に出す（app/(main)/layout）
//   ・自分が入っている部屋だけ。今日より前の日と、終わった部屋は出さない
//   ・新しい発言があると赤い丸の件数（RoundChatNewBadge）
//   ・部屋はふだんの bootstrap に入っている（自分が参加している募集）ので、ここで読み込みはしない
export function AvailRoomsBar() {
  const meId = useStore((s) => s.meId);
  const allRounds = useStore((s) => s.rounds);
  if (!meId) return null;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const rooms = allRounds
    .filter((r) => isAvailRoom(r) && r.status !== 'completed' && String(r.availDate) >= today
      && (r.applicantIds || []).includes(meId) && (r.applicantIds || []).length >= AVAIL_ROOM_MIN)
    .sort((a, b) => String(a.availDate).localeCompare(String(b.availDate)));
  if (!rooms.length) return null;

  return (
    <div className="px-5 pt-2.5 pb-1">
      <div className="flex items-center gap-2 bg-green-light border-2 border-green rounded-xl pl-3 pr-1.5 py-1.5">
        <span className="text-[12px] font-black text-green whitespace-nowrap">💬 行ける日のチャット</span>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {rooms.map((r) => {
            const l = dateLabel(String(r.availDate));
            return (
              <Link key={r.id} href={`/round/${r.id}/chat`} aria-label={`${l.md}（${l.w}）のチャット・${(r.applicantIds || []).length}人`}
                className="flex items-center gap-1 bg-white border-2 border-green rounded-full pl-2.5 pr-1.5 py-1 text-[12px] font-black text-green whitespace-nowrap flex-shrink-0">
                <span>{l.md}（{l.w}）</span>
                <span className="text-[10px] font-bold text-sub">{(r.applicantIds || []).length}人</span>
                <RoundChatNewBadge roundId={r.id} />
                <span>›</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
