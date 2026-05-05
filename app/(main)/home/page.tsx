'use client';

import { getMe, store, useStore } from '@/lib/store';
import { RoundCard } from '@/components/RoundCard';

export default function HomePage() {
  const me = useStore(getMe);
  const rounds = useStore((s) => s.rounds.filter((r) => r.status === 'open'));
  const users = useStore((s) => s.users);

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">ホーム</div>

      <div className="px-5 pb-3">
        <div className="bg-card rounded-card p-5 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-[52px] h-[52px] rounded-full bg-green-light flex items-center justify-center text-2xl">{me.avatar}</div>
            <div>
              <div className="text-[17px] font-black">{me.displayName}</div>
              <div className="text-xs text-sub">{me.age}代 ・ スコア {me.scoreRange} ・ {me.area}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Stat value={me.reviewAvg.toFixed(1)} label="レビュー平均" color="text-green" />
            <Stat value={String(me.roundCount)} label="ラウンド回数" color="text-blue" />
            <Stat value={String(me.buddyCount)} label="ゴル友" color="text-orange" />
          </div>
        </div>
      </div>

      <div className="px-5">
        <div className="text-base font-black mb-3">📋 新着ラウンド募集</div>
        {rounds.map((r) => (
          <RoundCard key={r.id} round={r} host={users.find((u) => u.id === r.hostId)} />
        ))}
      </div>

      <div className="p-5">
        <div className="text-base font-black mb-3">⭐ レビューをシミュレーション</div>
        <button
          onClick={() => store.triggerDemoReview()}
          className="w-full py-3.5 bg-orange text-white rounded-xl text-sm font-bold"
        >
          レビュー強制ポップアップを体験する
        </button>
        <div className="text-[11px] text-muted mt-1.5 text-center">
          ※ラウンド日時経過後に表示されるレビュー画面のデモ
        </div>
      </div>
      <div className="h-5" />
    </>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex-1 bg-bg rounded-[10px] p-2.5 text-center">
      <div className={`text-[22px] font-black ${color}`}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}
