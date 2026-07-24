'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore, getMe } from '@/lib/store';
import { competitionGroupsComplete } from '@/lib/groups';

// JST の YYYY-MM-DD（offsetDays 日後）。Date.now を JST に寄せてから日付部分を取る。
function jstYmd(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

// 主催コンペの「当日/前日ブロッキング」。
// 開催日が今日または明日のコンペで、組み分けがまだ完了していない場合、アプリを開くと
// 閉じられないモーダルを出して他操作を塞ぐ（相互レビューに組み分けが必須のため）。
// ただし当該ラウンドのページ自身では出さない（そこで組み分けを登録するため）。
export function GroupGate() {
  const me = useStore(getMe);
  const rounds = useStore((s) => s.rounds);
  const pathname = usePathname();
  if (!me) return null;

  const today = jstYmd(0);
  const tomorrow = jstYmd(1);
  const target = rounds.find(
    (r) =>
      r.hostId === me.id &&
      r.isCompetition &&
      r.status !== 'completed' &&
      (r.date === today || r.date === tomorrow) &&
      !competitionGroupsComplete(r),
  );
  if (!target) return null;
  // 当該ラウンドのページでは塞がない（組み分けを登録できるように）。
  if (pathname === `/round/${target.id}`) return null;

  return (
    <div className="absolute inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-card max-w-[360px] w-full p-6 shadow-lg text-center">
        <div className="text-4xl mb-2">⛳️</div>
        <h3 className="text-lg font-black mb-2">組分けが未登録です</h3>
        <p className="text-[13px] text-sub leading-relaxed mb-2">
          「{target.title}」（{target.date}）の組分けがまだ登録されていません。
        </p>
        <p className="text-[13px] text-red-600 font-bold leading-relaxed mb-4">
          相互レビューに関わるため、必ず登録が必須です。<br />
          全参加者を組に割り当てる（当日来れなかった人は「当日来れなかった人」へ移す）まで、他の操作はできません。
        </p>
        <Link
          href={`/round/${target.id}?tab=groups`}
          className="block w-full py-3 bg-green text-white rounded-xl font-bold text-sm"
        >
          組分けを登録する
        </Link>
      </div>
    </div>
  );
}
