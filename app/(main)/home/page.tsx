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
import { isRoundHost } from '@/lib/roundHost';

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

// 「直近1時間にログインした人数」表示のON/OFF。一旦非表示（再表示は true に戻す）。
const SHOW_ACTIVE_NOW = false;

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
  // 直近1時間にログイン（アプリを開いた）人数。ホーム上部に「いま何人来ているか」を出す。
  const [activeNow, setActiveNow] = useState<number | null>(null);
  useEffect(() => {
    if (!SHOW_ACTIVE_NOW) return; // 非表示中はAPIも叩かない
    let cancelled = false;
    fetch('/api/stats/active-now', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && typeof d.count === 'number') setActiveNow(d.count); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, []);
  // 「そろそろ募集してみない？」ポップアップ（主催者を増やすための後押し）。
  // 出す相手＝参加経験あり×主催経験なし（サーバー側 /api/me/host-nudge が判定）。
  // 頻度＝7日に1回まで、3回閉じたら以降は出さない（localStorageで管理）。
  const [hostNudge, setHostNudge] = useState<{ name: string; joinedCount: number; fillRate: number } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (Number(localStorage.getItem('gb_hostnudge_dismissed') || 0) >= 3) return;
      const last = Number(localStorage.getItem('gb_hostnudge_at') || 0);
      if (last && Date.now() - last < 7 * 24 * 3600 * 1000) return;
    } catch { /* noop */ }
    let cancelled = false;
    fetch('/api/me/host-nudge', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.show) return;
        setHostNudge({ name: d.name || '', joinedCount: d.joinedCount || 0, fillRate: d.fillRate || 0 });
        try { localStorage.setItem('gb_hostnudge_at', String(Date.now())); } catch {}
      })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, []);
  function closeHostNudge(go: boolean) {
    if (!go) {
      try {
        const n = Number(localStorage.getItem('gb_hostnudge_dismissed') || 0) + 1;
        localStorage.setItem('gb_hostnudge_dismissed', String(n));
      } catch {}
    }
    setHostNudge(null);
    if (go) router.push('/create');
  }

  // 直近ログインしたユーザー（最大30人・ログイン新しい順）。プロフィール下にグリッド表示。
  // DMは「ゴル友 or 同じコンペを回った人」だけ（canDm）。それ以外はタップでプロフィールのみ。
  type RecentUser = { id: string; displayName: string; avatar: string; avatarUrl: string; avatarMode?: 'photo' | 'emoji' | 'golmoti'; golmotiType?: string; color: string; canDm: boolean };
  const [recentLogins, setRecentLogins] = useState<RecentUser[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats/recent-logins', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && Array.isArray(d.users)) setRecentLogins(d.users); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, []);
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
  const allRounds = useStore((s) => s.rounds);
  const users = useStore((s) => s.users);
  // 自分が「主催 or 参加/申請中」で、まだ完了していない（開催前の）ラウンド。
  // 開催日の昇順（日程未定は末尾）。ホーム上部の「参加予定」枠に出す。
  const myUpcoming = allRounds
    .filter((r) => r.status !== 'completed' && (r.hostId === me.id || (r.applicantIds || []).includes(me.id) || (r.pendingApplicantIds || []).includes(me.id)))
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });
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
    s.rounds.filter((r) => isRoundHost(r, s.meId)).flatMap((r) =>
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

      {/* いま何人が来ているか（直近1時間にアプリを開いた人数）。にぎわいを可視化。※一旦非表示中。 */}
      {SHOW_ACTIVE_NOW && activeNow != null && activeNow > 0 && (
        <div className="px-5 pb-3">
          <div className="inline-flex items-center gap-2 bg-green-light border border-green rounded-full px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green" />
            </span>
            <span className="text-[12px] font-black text-green">直近1時間に {activeNow}人 がログイン</span>
          </div>
        </div>
      )}

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

      {/* 参加予定のラウンド（自分が主催 or 参加/申請中で開催前）。開催日昇順で見やすく。 */}
      {myUpcoming.length > 0 && (
        <div className="px-5 pb-3">
          <div className="bg-card rounded-card shadow-card overflow-hidden border-2 border-blue">
            <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-2">
              <span className="text-base font-black">📅 参加予定のラウンド</span>
              <span className="text-[11px] font-black text-white bg-blue px-2 py-0.5 rounded-full leading-none">{myUpcoming.length}</span>
            </div>
            <div className="px-3 pb-3 flex flex-col gap-1.5">
              {myUpcoming.slice(0, 5).map((r) => {
                const mine = r.hostId === me.id;
                const joined = (r.applicantIds || []).includes(me.id);
                const role = mine ? '主催' : joined ? '参加確定' : '承認待ち';
                const roleCls = mine ? 'bg-orange-light text-orange' : joined ? 'bg-green-light text-green' : 'bg-bg text-sub';
                const md = r.date ? `${Number(r.date.slice(5, 7))}/${Number(r.date.slice(8, 10))}` : '未定';
                return (
                  <Link href={`/round/${r.id}`} key={r.id} className="flex items-center gap-2.5 bg-bg rounded-xl px-3 py-2.5">
                    <div className="w-9 text-center flex-shrink-0">
                      <div className="text-[13px] font-black text-blue leading-none">{md}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">{r.title}</div>
                      <div className="text-[10px] text-muted truncate">{[r.eventType === 'drink' ? (r.venue || '🍻 飲み会') : (r.courseName || r.area), r.status === 'closed' ? '締切' : null].filter(Boolean).join(' ・ ') || (r.eventType === 'drink' ? '🍻 飲み会' : 'コース未定')}</div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${roleCls}`}>{role}</span>
                    <span className="text-muted flex-shrink-0">›</span>
                  </Link>
                );
              })}
              {myUpcoming.length > 5 && (
                <Link href="/mypage" className="text-[11px] font-bold text-blue text-center pt-1">ほか{myUpcoming.length - 5}件をマイページで見る ›</Link>
              )}
            </div>
          </div>
        </div>
      )}

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
            <span>📅</span>
            <span>直近のラウンド</span>
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

      {/* 直近ログインしたユーザー（ログイン新しい順・最大30人）。ホーム最下部に配置。写真＋名前のみ。
          すでにつながっている人（ゴル友・一緒に回った人など＝canDm）はアイコンに薄い緑のリング。 */}
      {recentLogins.length > 0 && (
        <div className="px-5 pt-1 pb-3">
          <div className="text-[12px] font-bold text-sub mb-2">🟢 最近ログインしたユーザー</div>
          <div className="grid grid-cols-5 gap-x-2 gap-y-3">
            {recentLogins.map((u) => (
              <Link key={u.id} href={`/profile/${u.id}`} className="flex flex-col items-center min-w-0">
                <div className={`rounded-full p-[2px] ${u.canDm ? 'bg-green-light' : ''}`}>
                  <Avatar user={u} size={44} />
                </div>
                <div className="text-[10px] text-center truncate w-full mt-1">{u.displayName}</div>
              </Link>
            ))}
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

      {/* ⛳ 主催のお誘いポップアップ。白クマがカードの上から覗く形（案1×ポーズ3）。 */}
      {hostNudge && (
        <div className="absolute inset-0 bg-black/50 z-[120] flex items-center justify-center p-5 backdrop-blur-sm">
          <div className="relative w-full max-w-[330px]">
            {/* クマがカードの上端に両手を引っかけて、その上からひょこっと覗いている見た目。
                画像は「頭＋両手」までを切り出したもの。手がちょうど枠の縁に重なるよう、
                画像の下端をカード上端より 22px だけ下に食い込ませている。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bear-peek.png"
              alt=""
              className="absolute left-3 -top-[122px] w-[165px] h-auto pointer-events-none select-none drop-shadow-lg"
            />
            <div className="relative bg-card border-2 border-border rounded-card shadow-card pt-9 px-6 pb-6 text-center">
              <button
                onClick={() => closeHostNudge(false)}
                aria-label="閉じる"
                className="absolute top-2.5 right-3 text-muted text-lg font-black leading-none"
              >✕</button>

              <div className="text-[17px] font-black leading-snug mb-1.5">
                次は、{hostNudge.name ? `${hostNudge.name}さん` : 'あなた'}が<br />募集してみない？
              </div>
              <div className="text-[12px] text-sub leading-relaxed mb-4">
                {hostNudge.joinedCount > 0 && <>もう<b className="text-text">{hostNudge.joinedCount}回</b>参加しているから、<br /></>}
                誘う側もきっとうまくいくよ。
              </div>

              {hostNudge.fillRate > 0 && (
                <div className="flex items-center gap-3 bg-green-light border-2 border-green rounded-xl px-3.5 py-2.5 mb-4 text-left">
                  <span className="text-[26px] font-black text-green leading-none tabular-nums">{hostNudge.fillRate}%</span>
                  <span className="text-[11px] font-bold text-green leading-tight">いま、立った募集の<br />{hostNudge.fillRate}%が満員になっています</span>
                </div>
              )}

              <button
                onClick={() => closeHostNudge(true)}
                className="w-full py-3.5 bg-orange text-white border-2 border-border rounded-xl text-[15px] font-black shadow-card"
              >募集をつくる（1分）</button>
              <button
                onClick={() => closeHostNudge(false)}
                className="w-full py-2.5 text-sub text-[13px] font-bold mt-1"
              >あとで</button>
            </div>
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
