'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMe, store, useStore } from '@/lib/store';
import { RoundCard } from '@/components/RoundCard';
import { Avatar } from '@/components/Avatar';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const BOT_BASIC_ID = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID || '';

export default function HomePage() {
  const me = useStore(getMe);
  const [showAddBot, setShowAddBot] = useState(false);
  useEffect(() => {
    if (!BOT_BASIC_ID || me.notifyOff) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('gb_add_bot_dismissed') === '1') return;
    setShowAddBot(true);
  }, [me.notifyOff]);
  const rounds = useStore((s) => s.rounds.filter((r) => r.status === 'open'));
  const users = useStore((s) => s.users);
  const myHostedPending = useStore((s) =>
    s.rounds.filter((r) => r.hostId === s.meId).flatMap((r) =>
      (r.pendingApplicantIds || []).map((uid) => ({ round: r, applicantId: uid }))
    )
  );

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">ホーム</div>

      {showAddBot && (
        <div className="px-5 pb-3">
          <div className="bg-green-light border-2 border-green rounded-card p-3.5 flex items-center gap-3">
            <span className="text-xl">🔔</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-black text-green">通知を受け取るには公式アカウントを友だち追加</div>
              <div className="text-[11px] text-sub mt-0.5">メッセージや申請を LINE で受信できます</div>
            </div>
            <a
              href={`https://line.me/R/ti/p/${encodeURIComponent(BOT_BASIC_ID)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-green text-white text-xs font-bold rounded-full whitespace-nowrap"
            >追加</a>
            <button
              onClick={() => { localStorage.setItem('gb_add_bot_dismissed', '1'); setShowAddBot(false); }}
              className="text-muted text-lg leading-none px-1"
              aria-label="閉じる"
            >×</button>
          </div>
        </div>
      )}

      {myHostedPending.length > 0 && (
        <div className="px-5 pb-3">
          <Link href="/mypage" className="block bg-orange-light border-2 border-orange rounded-card p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📥</span>
              <div className="flex-1">
                <div className="text-sm font-black text-orange">
                  参加申請が {myHostedPending.length} 件届いています
                </div>
                <div className="text-[11px] text-sub mt-0.5">タップして承認/却下</div>
              </div>
              <span className="text-orange">›</span>
            </div>
          </Link>
        </div>
      )}

      <div className="px-5 pb-3">
        <div className="bg-card rounded-card p-5 shadow-card">
          <div className="flex items-center gap-3 mb-4">
            <Avatar user={me} size={52} />
            <div>
              <div className="text-[17px] font-black">{me.displayName}</div>
              <div className="text-xs text-sub">
                {[me.age ? `${me.age}歳` : null, me.scoreRange ? `スコア ${me.scoreRange}` : null, me.area || null].filter(Boolean).join(' ・ ') || 'プロフィールを設定しましょう'}
              </div>
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
        {rounds.length === 0 ? (
          <div className="bg-card rounded-card p-8 text-center shadow-card">
            <div className="text-4xl mb-3">⛳</div>
            <div className="text-sm font-bold mb-2">まだ募集がありません</div>
            <div className="text-xs text-sub mb-4">あなたが最初の募集を立ててみませんか？</div>
            <Link href="/create" className="inline-block px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">
              募集を作成する
            </Link>
          </div>
        ) : (
          rounds.map((r) => (
            <RoundCard key={r.id} round={r} host={users.find((u) => u.id === r.hostId)} />
          ))
        )}
      </div>

      {isDemo && (
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
      )}
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
