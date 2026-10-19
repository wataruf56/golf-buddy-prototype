'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/telemetry';
import { PhoneFrame } from '@/components/PhoneFrame';
import { TabBar } from '@/components/TabBar';
import { ReviewOverlay } from '@/components/ReviewOverlay';
import { GroupGate } from '@/components/GroupGate';
import { CompletionGate } from '@/components/CompletionGate';
import { AvailPromptPopup } from '@/components/AvailPromptPopup';
import { PaymentAckGate } from '@/components/PaymentAckGate';
import { HoldDueGate } from '@/components/HoldDueGate';
import { RoundPromoPopup } from '@/components/RoundPromoPopup';
import { AvailMonthlyPopup } from '@/components/AvailMonthlyPopup';
import { GuideIntroPopup } from '@/components/GuideIntroPopup';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';
import { BlockerPopup } from '@/components/BlockerPopup';
import { ToastHost } from '@/components/Toast';
import { ConfirmHost } from '@/components/ConfirmDialog';
import { AgeGateScreen } from '@/components/AgeGateScreen';
import { LoginButtons } from '@/components/LoginButtons';
import { MatchingBanner } from '@/components/MatchingBanner';
import { UpdateBanner } from '@/components/UpdateBanner';
import { getMe, store, useStore } from '@/lib/store';
import { isMatchingAllowedByAge, isMatchingAllowedUser } from '@/lib/ageGate';

// Routes that don't require matching access (always available, regardless of age)
// /round is included so a friend who opens a shared round URL can read the
// post even before completing profile registration. The "join" button on the
// round page itself enforces the profile gate.
// /poll (日程調整) works the same way: the shared poll must be viewable without
// login/profile, and the answer buttons enforce the profile gate themselves.
const ALWAYS_ALLOWED = ['/guide', '/swing', '/mypage', '/profile', '/admin', '/legal', '/round', '/rounds', '/poll', '/qr', '/add-friend', '/invite', '/requests'];

// ログインが無いと中身を出せない画面（middleware の APP_PROTECTED_PREFIXES と同じ範囲＋/availability）。
// Cookie はあるが期限切れ・無効（2026-10-06 の一括無効化など）のとき middleware は通してしまうので、
// ここで「ログインし直してください」を出す。募集・日程調整・プロフィールなどは未ログインでも読める。
const LOGIN_REQUIRED_PREFIXES = ['/home', '/search', '/create', '/buddies', '/mypage', '/chat', '/swing', '/rematch', '/availability', '/invite', '/timeline', '/requests'];
function requiresLogin(pathname: string): boolean {
  return LOGIN_REQUIRED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function needsMatchingAccess(pathname: string): boolean {
  if (!pathname) return false;
  return !ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const pathname = usePathname() || '';
  const pendingCount = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending').length
  );
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);
  // ポップアップは同時に1つだけ（lib/popupSlot）。レビューは主催者の完了・組み分けの次
  const reviewActive = usePopupSlot('review', POPUP_PRIORITY.review, pendingCount > 0 && (overlayOpen || blockerOpen));

  const matchingAllowed = isMatchingAllowedUser(me);
  // 年齢未入力（新規会員）は見るだけならOK。対象外の年齢と、募集を立てる画面（プロフィール必須）だけ止める（2026-10-08）
  const ageUnset = !me?.age || me.age <= 0;
  const needsProfileHere = pathname === '/create' || pathname.startsWith('/create/');
  const ageGated = hydrated && needsMatchingAccess(pathname) && !matchingAllowed && (!ageUnset || needsProfileHere);
  // getMe は未ログインでも仮の人（id='me'）を返すので、ログイン有無は meId で見る
  const meIdForGate = useStore((s) => s.meId);
  const loggedOut = hydrated && !meIdForGate && requiresLogin(pathname);
  const banned = useStore((s) => s.banned);
  // 赤バン（アカウント停止）は全画面を遮断（ログイン中でも一切使えない状態にする）。
  const banGated = hydrated && banned;

  useEffect(() => {
    if (pendingCount > 0 && !blockerOpen) setOverlayOpen(true);
    if (pendingCount === 0) {
      setOverlayOpen(false);
      setBlockerOpen(false);
    }
  }, [pendingCount, blockerOpen]);

  // リアルタイム更新：画面遷移・タブ再表示のたびに最新状態を取り込む（招待承認・
  // 参加確定などが、アプリを開き直さなくても反映されるように）。過剰取得を避け
  // 直近4秒はスキップする軽いスロットル付き。
  const lastRefreshRef = useRef(0);
  function refreshData() {
    if (!store.get().hydrated) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 4000) return;
    lastRefreshRef.current = now;
    store.hydrate().catch(() => {});
  }
  useEffect(() => {
    refreshData();
    // 画面遷移ごとに「どの画面を開いたか」を記録（人気の画面の分析用）。
    if (pathname) track('page_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshData(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabBlock(href?: string) {
    // 2026-10-11：未完了のレビューがある間は、どのタブ（マイページも）を押してもレビュー画面のまま。
    // 以前はタブを押すとレビュー画面が閉じて下の小さな案内だけになり、画面の中身を操作できてしまっていた。
    void href;
    if (pendingCount > 0) {
      popupEvent('review', 'tab_blocked', { to: href || '' });
      setBlockerOpen(false);
      setOverlayOpen(true);
      return true;
    }
    return false;
  }

  return (
    <PhoneFrame>
      <UpdateBanner />
      <div className="screen">
        {!hydrated ? (
          <div className="flex flex-col items-center justify-center h-full pt-32">
            <div className="w-12 h-12 rounded-full bg-green-light flex items-center justify-center text-2xl mb-3 animate-pulse">⛳</div>
            <div className="text-xs text-muted">読み込み中...</div>
          </div>
        ) : banGated ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <div className="text-base font-black mb-2">現在ご利用を制限しています</div>
            <div className="text-[13px] text-sub leading-relaxed">
              募集・参加・チャットなどのコミュニティ機能の利用が制限されています。<br />
              お心当たりがない場合は運営までお問い合わせください。
            </div>
          </div>
        ) : loggedOut ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="text-4xl mb-3">🔒</div>
            <div className="text-base font-black mb-2">ログインが必要です</div>
            <div className="text-[13px] text-sub leading-relaxed mb-5">
              ログインの有効期限が切れたか、まだ登録していません。<br />
              新規登録もログインもLINEで開きます（無料）。
            </div>
            <div className="w-full max-w-[320px] text-left">
              <LoginButtons to={typeof window !== 'undefined' ? window.location.pathname + window.location.search : pathname} />
            </div>
          </div>
        ) : ageGated ? (
          <AgeGateScreen age={me?.age} returnTo={pathname} />
        ) : (
          <>
            {/* DM（/chat）は固定ヘッダー＋入力欄でビューポートを使い切る全画面レイアウト。
                コミュニティ帯を出すとその高さぶん下にはみ出して入力欄がタブバーと重なるため、
                チャット画面ではバナーを出さない（年齢ゲート自体は従来どおり有効）。 */}
            {needsMatchingAccess(pathname) && !pathname.startsWith('/chat') && <MatchingBanner />}
            {children}
          </>
        )}
      </div>
      {reviewActive && blockerOpen && pendingCount > 0 && (
        <BlockerPopup onOpen={() => { setBlockerOpen(false); setOverlayOpen(true); }} />
      )}
      {reviewActive && overlayOpen && pendingCount > 0 && <ReviewOverlay />}
      <GroupGate />
      <CompletionGate />
      {/* 保留にしていた参加申請の期日（主催者・共同管理者・閉じられない・その場で承認か見送りを選べる）（2026-10-13）。
          レビュー待ちでは止めない（優先98＞レビュー90。どちらもその場で解けるので詰まらない） */}
      <HoldDueGate blocked={banGated || loggedOut} />
      {/* ラウンド後の「行ける日を入力してみませんか？」（運営がOKを出してから・レビューが先）（2026-10-11） */}
      <AvailPromptPopup blocked={pendingCount > 0 || banGated || loggedOut || ageGated} />
      {/* すでに参加している募集に、あとから事前入金が設定されたときの確認（2026-10-11） */}
      <PaymentAckGate blocked={pendingCount > 0 || banGated || loggedOut || ageGated} />
      {/* イチオシ募集（1回だけ・ほかのポップアップが閉じて1時間後）（2026-10-12） */}
      <RoundPromoPopup blocked={pendingCount > 0 || banGated || loggedOut || ageGated} />
      {/* 毎月の「行ける日を入れませんか？」（月末2日前〜月末・翌月と翌々月が未入力の人）（2026-10-12） */}
      <AvailMonthlyPopup blocked={pendingCount > 0 || banGated || loggedOut || ageGated} />
      {/* 初めて登録した人へ「使い方を見てみませんか？」（使い方は下のタブから外してマイページへ・2026-10-17） */}
      <GuideIntroPopup blocked={pendingCount > 0 || banGated || loggedOut || ageGated} />
      {/* 友だち追加の案内（LineFollowPrompt）はホームの関所（FriendGate）に置き換えた（2026-10-04） */}
      <ToastHost />
      <ConfirmHost />
      <TabBar onBlock={onTabBlock} />
    </PhoneFrame>
  );
}
