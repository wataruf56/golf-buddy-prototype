'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { RoundCard } from '@/components/RoundCard';
import { Avatar } from '@/components/Avatar';
import { HomeUpdateCard } from '@/components/HomeUpdateCard';
import { toast } from '@/components/Toast';
import { RESTRICTION_MSG } from '@/lib/restrictions';

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
  const restrictions = useStore((s) => s.restrictions);
  const notifications = useStore((s) => s.notifications);
  // Capture the "last read" timestamp ONCE on mount so unread highlights stay
  // stable while the user is looking at the list (we mark-read in the bg below).
  const readAtRef = useRef<number>(me.notifReadAt || 0);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showAddBot, setShowAddBot] = useState(false);
  // マッチ成立のポップアップ（ホームで大きく表示）。一度見たら再表示しない。
  const [matchPopup, setMatchPopup] = useState<{ text: string; tab: string } | null>(null);
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
    // 公式LINEを友だち追加済みと判定できた人には出さない（LIFFのgetFriendship由来）。
    if (me.botFollowed === true) return;
    if (localStorage.getItem('gb_add_bot_dismissed') === '1') return;
    // Same marker the mypage modal sets when the user confirms they added
    // the bot — once that happens we never show the home banner either.
    if (localStorage.getItem('gb_bot_added') === '1') return;
    setShowAddBot(true);
  }, [me.notifyOff, me.botFollowed]);
  // マッチ通知が来たらポップアップ。localStorageで既読管理し再表示を防ぐ。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ms = notifications.filter((n) => (n as any).type === 'match');
    if (!ms.length) return;
    const newest = ms[0];
    const seen = Number(localStorage.getItem('gb_match_popup_seen') || 0);
    if ((newest.createdAt || 0) <= seen) return;
    const tab = newest.text.includes('気になる') ? 'romantic' : 'again';
    setMatchPopup({ text: newest.text, tab });
  }, [notifications]);
  function closeMatchPopup(go: boolean) {
    const newest = notifications.filter((n) => (n as any).type === 'match')[0];
    if (newest) { try { localStorage.setItem('gb_match_popup_seen', String(newest.createdAt)); } catch {} }
    const tab = matchPopup?.tab;
    setMatchPopup(null);
    if (go && tab) router.push(`/buddies?tab=${tab}`);
  }

  const rounds = useStore((s) => s.rounds.filter((r) => r.status === 'open'));
  const users = useStore((s) => s.users);
  // ホーム最上部に出す「ゴルトモ公式の直近コンペ」。公式(isOfficial)かつコンペ規模
  // (5名以上)で募集中のものから、開催が近い順に1件。未来の予定が無ければ最新作成分。
  const officialComp = (() => {
    const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    // 満員（枠が埋まった）コンペは先頭に固定しない。
    const comps = rounds.filter((r) => r.isOfficial && r.maxSpots >= 5 && (r.currentCount || 0) < r.maxSpots);
    const upcoming = comps
      .filter((r) => r.date && r.date >= todayStr)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1));
    if (upcoming.length) return upcoming[0];
    return comps.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  })();
  // ホームの「ゴルトモ公式コンペ」枠に出す一覧。直近の公式コンペを先頭に固定し、
  // 残りは開催日の昇順（日程未定は末尾）。満員も表示する（カード側でグレーアウト＋
  // 「満員」表示）。
  const displayRounds = (() => {
    const rest = rounds
      .filter((r) => r.id !== officialComp?.id)
      .sort((a, b) => {
        const am = a.date ? new Date(a.date).getTime() : Infinity;
        const bm = b.date ? new Date(b.date).getTime() : Infinity;
        return am - bm;
      });
    return [...(officialComp ? [officialComp] : []), ...rest];
  })();
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

  // 未読（このホーム表示の開始時点より新しい通知）。上部のインライン表示はこれがある時だけ。
  const unread = notifications.filter((n) => n.createdAt > readAtRef.current);

  function renderNotif(n: typeof notifications[number]) {
    const isUnread = n.createdAt > readAtRef.current;
    const body = (
      <div className={`flex items-start gap-2.5 px-4 py-3 border-t border-border ${isUnread ? 'bg-green-light/40' : ''}`}>
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${isUnread ? 'bg-green' : 'bg-transparent'}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13px] leading-snug ${isUnread ? 'font-bold text-text' : 'text-sub'}`}>{n.text}</div>
          <div className="text-[10px] text-muted mt-0.5">{relTime(n.createdAt)}</div>
        </div>
        {n.link && <span className="text-muted text-sm mt-0.5">›</span>}
      </div>
    );
    return n.link ? (
      <button key={n.id} onClick={() => { setShowNotifModal(false); router.push(n.link!); }} className="block w-full text-left">{body}</button>
    ) : (
      <div key={n.id}>{body}</div>
    );
  }

  return (
    <>
      <div className="px-5 pt-2 pb-4 flex items-center justify-between">
        <span className="text-2xl font-black tracking-tight">ホーム</span>
        <button
          onClick={() => setShowNotifModal(true)}
          className="relative w-10 h-10 rounded-full bg-card border-2 border-border flex items-center justify-center"
          aria-label="お知らせ"
        >
          <span className="text-lg leading-none">🔔</span>
          {unread.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-card">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </button>
      </div>

      {/* 公式LINE未登録の人向け：最上部に「LINEで通知を受け取る」ボタン（押すと友だち追加へ） */}
      {showAddBot && (
        <div className="px-5 pb-3">
          {/* 公式アカウントのfriend-add URLは @basicId をそのまま使う。
              encodeURIComponentで @→%40 にすると解決できず汎用QRページに飛ぶ。 */}
          <a
            href={`https://line.me/R/ti/p/@${BOT_BASIC_ID.replace(/^@/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              // 先にフラグだけ立て、非表示は遅延させる。onClickで即 setState すると
              // <a> がクリック処理中にアンマウントされ、Chrome等で遷移がキャンセル
              // されることがあるため（Safariでは動くが他ブラウザで飛ばない不具合）。
              try { localStorage.setItem('gb_bot_added', '1'); } catch {}
              setTimeout(() => setShowAddBot(false), 800);
            }}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-card border-2 border-border shadow-card font-black text-white"
            style={{ background: '#06C755' }}
          >
            <img src="/line-logo.png" alt="LINE" width="184" height="183" className="h-6 w-auto bg-white rounded-md border-2 border-border p-0.5" style={{ boxSizing: 'content-box' }} />
            <span>LINEで通知を受け取る</span>
          </a>
          <button
            onClick={() => { localStorage.setItem('gb_add_bot_dismissed', '1'); setShowAddBot(false); }}
            className="block mx-auto mt-1 text-[11px] text-muted underline"
          >通知は不要（閉じる）</button>
        </div>
      )}

      <HomeUpdateCard />


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

      {/* プロフィール（タップでマイページ／鉛筆で編集）。統計はマイページに集約。 */}
      <div className="px-5 pb-3">
        <div className="bg-card rounded-card p-3.5 shadow-card flex items-center gap-3">
          <Link href="/mypage" className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar user={me} size={46} />
            <div className="min-w-0">
              <div className="text-[16px] font-black truncate">{me.displayName || 'プロフィール'}</div>
              <div className="text-[11px] text-muted">タップでプロフィール</div>
            </div>
          </Link>
          <Link href="/mypage/edit" className="flex-shrink-0 px-3 py-2 bg-bg border-2 border-border rounded-full text-xs font-bold">✏️ 編集</Link>
        </div>
      </div>

      {/* 募集する／さがす */}
      <div className="px-5 pb-3 grid grid-cols-2 gap-3">
        <Link
          href="/create"
          onClick={(e) => { if (restrictions.noCreate) { e.preventDefault(); toast(RESTRICTION_MSG.noCreate, 'error'); } }}
          className="bg-orange text-white border-2 border-border rounded-card shadow-card py-4 text-center font-black"
        >
          <div className="text-2xl leading-none mb-1">＋</div>ラウンドを募集
        </Link>
        <Link href="/search" className="bg-green text-white border-2 border-border rounded-card shadow-card py-4 text-center font-black">
          <div className="text-2xl leading-none mb-1">🔍</div>募集をさがす
        </Link>
      </div>

      {/* 未読がある時だけ、上部にインライン表示。既読・過去はベルから確認。 */}
      {unread.length > 0 && (
        <div className="px-5 pb-3">
          <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-green">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <div className="text-base font-black flex items-center gap-1.5">
                🔔 新着のお知らせ
                <span className="text-[11px] font-black text-white bg-red px-2 py-0.5 rounded-full leading-none">{unread.length}</span>
              </div>
              <button onClick={() => setShowNotifModal(true)} className="text-[11px] font-bold text-blue">すべて見る</button>
            </div>
            <div>
              {unread.slice(0, 5).map((n) => renderNotif(n))}
            </div>
          </div>
        </div>
      )}

      {/* ゴルトモ公式コンペ。直近の公式コンペを先頭に固定し、以降は募集中を日付昇順で。満員は非表示。 */}
      <section className="mt-2 bg-green-light border-y-2 border-green pt-4 pb-3">
        <div className="px-5 mb-3">
          <div className="text-xl font-black flex items-center gap-2 text-green-dark">
            <span>🏆</span>
            <span>ゴルトモ公式コンペ</span>
            {displayRounds.length > 0 && (
              <span className="text-[12px] font-black text-white bg-orange px-2.5 py-1 rounded-full leading-none">{displayRounds.length}件</span>
            )}
            <Link href="/search" className="ml-auto text-xs font-black text-green whitespace-nowrap">もっと見る ›</Link>
          </div>
          <div className="text-[12px] text-sub font-bold mt-1">公式コンペと、募集中のラウンド</div>
        </div>
        <div className="px-5">
          {displayRounds.length === 0 ? (
            <div className="bg-card rounded-card p-8 text-center shadow-card">
              <div className="text-4xl mb-3">⛳</div>
              <div className="text-sm font-bold mb-2">まだ募集がありません</div>
              <div className="text-xs text-sub mb-4">あなたが最初の募集を立ててみませんか？</div>
              <Link href="/create" onClick={(e) => { if (restrictions.noCreate) { e.preventDefault(); toast(RESTRICTION_MSG.noCreate, 'error'); } }} className="inline-block px-5 py-2.5 bg-green text-white rounded-xl text-sm font-bold">
                募集を作成する
              </Link>
            </div>
          ) : (
            displayRounds.map((r) => (
              <RoundCard key={r.id} round={r} />
            ))
          )}
        </div>
      </section>

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

      {/* ベルから開く全件パネル（既読・過去も確認できる） */}
      {showNotifModal && (
        <div
          className="absolute inset-0 z-[100] bg-black/50 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={() => setShowNotifModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card w-full max-w-[360px] max-h-[70vh] rounded-card flex flex-col shadow-lg overflow-hidden border-2 border-border"
          >
            <div className="flex items-center justify-between px-4 py-3.5 border-b-2 border-border flex-shrink-0">
              <div className="text-base font-black flex items-center gap-1.5">🔔 お知らせ</div>
              <button onClick={() => setShowNotifModal(false)} className="text-muted text-2xl leading-none px-1" aria-label="閉じる">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted">お知らせはまだありません</div>
              ) : (
                notifications.map((n) => renderNotif(n))
              )}
            </div>
            {notifications.length > 0 && unread.length === 0 && (
              <div className="px-4 py-2.5 text-center text-[11px] text-muted border-t border-border flex-shrink-0">
                ✓ 未読のお知らせはありません
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🎉 マッチ成立ポップアップ（レビューと同じ大きさ・中央表示） */}
      {matchPopup && (
        <div className="absolute inset-0 bg-black/50 z-[120] flex items-center justify-center p-5 backdrop-blur-sm">
          <div className="bg-card rounded-card p-7 w-full max-w-[340px] shadow-lg text-center">
            <div className="text-5xl mb-2">🎉</div>
            <div className="text-xl font-black mb-1.5">マッチしました！</div>
            <div className="text-[13px] text-sub mb-6 leading-relaxed">{matchPopup.text}</div>
            <button onClick={() => closeMatchPopup(true)} className="w-full py-3.5 bg-green text-white rounded-xl text-[15px] font-bold mb-2">見に行く</button>
            <button onClick={() => closeMatchPopup(false)} className="w-full py-3 text-sub text-sm font-bold">閉じる</button>
          </div>
        </div>
      )}
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
