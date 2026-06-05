'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { RoundCard } from '@/components/RoundCard';
import { Avatar } from '@/components/Avatar';
import { HomeUpdateCard } from '@/components/HomeUpdateCard';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'たった今';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}日前`;
  return `${Math.floor(d / 7)}週間前`;
}

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const BOT_BASIC_ID = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID || '';

export default function HomePage() {
  const router = useRouter();
  const me = useStore(getMe);
  const notifications = useStore((s) => s.notifications);
  // Capture the "last read" timestamp ONCE on mount so unread highlights stay
  // stable while the user is looking at the list (we mark-read in the bg below).
  const readAtRef = useRef<number>(me.notifReadAt || 0);
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [showAddBot, setShowAddBot] = useState(false);
  // Mark the お知らせ inbox read shortly after viewing the home screen.
  useEffect(() => {
    if (!notifications.length) return;
    const newest = notifications[0]?.createdAt || 0;
    if (newest <= (me.notifReadAt || 0)) return; // nothing new
    const t = setTimeout(() => { store.markNotificationsRead(); }, 1500);
    return () => clearTimeout(t);
  }, [notifications, me.notifReadAt]);
  useEffect(() => {
    if (!BOT_BASIC_ID || me.notifyOff) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('gb_add_bot_dismissed') === '1') return;
    // Same marker the mypage modal sets when the user confirms they added
    // the bot — once that happens we never show the home banner either.
    if (localStorage.getItem('gb_bot_added') === '1') return;
    setShowAddBot(true);
  }, [me.notifyOff]);
  const rounds = useStore((s) => s.rounds.filter((r) => r.status === 'open'));
  const users = useStore((s) => s.users);
  const myHostedPending = useStore((s) =>
    s.rounds.filter((r) => r.hostId === s.meId).flatMap((r) =>
      (r.pendingApplicantIds || []).map((uid) => ({ round: r, applicantId: uid }))
    )
  );
  // Rounds I've been invited to (host pressed 招待) but haven't joined yet.
  const myInvites = useStore((s) =>
    s.rounds.filter((r) =>
      r.status === 'open' &&
      (r.invitedIds || []).includes(s.meId) &&
      r.hostId !== s.meId &&
      !r.applicantIds.includes(s.meId) &&
      !(r.pendingApplicantIds || []).includes(s.meId)
    )
  );
  // "ラウンド回数" = COMPLETED rounds only (host or approved applicant).
  // Open/recruiting rounds are excluded. Max with the stored counter so
  // completions outside the visible set still count.
  const myCompletedRoundCount = useStore((s) =>
    s.rounds.filter((r) =>
      r.status === 'completed' && (r.hostId === s.meId || r.applicantIds.includes(s.meId))
    ).length
  );
  // "ゴル友" = mutual-review buddies (rounded together + both reviewed).
  // buddyIds is the live set from /api/bootstrap; max with stored count.
  const buddyIdsCount = useStore((s) => s.buddyIds.length);
  const buddyCount = Math.max(me.buddyCount || 0, buddyIdsCount);

  return (
    <>
      <div className="px-5 pt-2 pb-4 text-2xl font-black tracking-tight">ホーム</div>

      <HomeUpdateCard />

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


      {myInvites.length > 0 && (
        <div className="px-5 pb-3 space-y-2">
          {myInvites.map((r) => (
            <Link key={r.id} href={`/round/${r.id}`} className="block bg-green-light border-2 border-green rounded-card p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💌</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-green">ラウンドに招待されています</div>
                  <div className="text-[11px] text-sub mt-0.5 truncate">「{r.title}」・タップして参加</div>
                </div>
                <span className="text-green">›</span>
              </div>
            </Link>
          ))}
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
            <Stat value={me.reviewCount ? me.reviewAvg.toFixed(1) : '初参加'} label="レビュー平均" color="text-green" />
            <Stat value={String(Math.max(me.roundCount || 0, myCompletedRoundCount))} label="ラウンド回数" color="text-blue" />
            <Stat value={String(buddyCount)} label="ゴル友" color="text-orange" />
          </div>
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="px-5 pb-3">
          <div className="bg-card rounded-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <div className="text-base font-black flex items-center gap-1.5">
                🔔 お知らせ
              </div>
              <div className="text-[11px] text-muted">通知はここにも届きます</div>
            </div>
            <div>
              {(showAllNotifs ? notifications : notifications.slice(0, 5)).map((n) => {
                const unread = n.createdAt > readAtRef.current;
                const body = (
                  <div className={`flex items-start gap-2.5 px-4 py-3 border-t border-border ${unread ? 'bg-green-light/40' : ''}`}>
                    {unread
                      ? <span className="mt-1.5 w-2 h-2 rounded-full bg-green flex-shrink-0" />
                      : <span className="mt-1.5 w-2 h-2 rounded-full bg-transparent flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] leading-snug ${unread ? 'font-bold text-text' : 'text-sub'}`}>{n.text}</div>
                      <div className="text-[10px] text-muted mt-0.5">{relTime(n.createdAt)}</div>
                    </div>
                    {n.link && <span className="text-muted text-sm mt-0.5">›</span>}
                  </div>
                );
                return n.link ? (
                  <button key={n.id} onClick={() => router.push(n.link!)} className="block w-full text-left">{body}</button>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })}
            </div>
            {notifications.length > 5 && (
              <button
                onClick={() => setShowAllNotifs((v) => !v)}
                className="w-full py-2.5 text-[12px] font-bold text-blue border-t border-border"
              >
                {showAllNotifs ? '閉じる' : `すべて表示（${notifications.length}件）`}
              </button>
            )}
          </div>
        </div>
      )}

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
