'use client';

import { PastRoundsList } from '@/components/PastRoundsList';

// 「過去のラウンド」= 自分が主催 or 参加した完了済みラウンド（一覧は components/PastRoundsList・マイページと共通）。
// 2026-10-17：下のタブからは外し、マイページに大きく置いた。このページは前からのリンク用に残す。
export default function PastRoundsPage() {
  return (
    <>
      <div className="px-5 pt-2 pb-1">
        <div className="text-2xl font-black tracking-tight">🏁 過去のラウンド</div>
        <div className="text-[11px] text-sub mt-0.5">押すと、その日のグループチャットが開きます。📷 はアルバムに写真があるラウンドです。</div>
      </div>
      <div className="px-5 pt-2"><PastRoundsList /></div>
      <div className="h-5" />
    </>
  );
}
