'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { chatIdFor, formatDate, revisitRatingLabel, carLabel, priceLabelForGender, isSplitPrice, timeAgo } from '@/lib/utils';
import { levelConditionLabel } from '@/lib/roundEligibility';
import { isRoundHost } from '@/lib/roundHost';
import { OfficialThreadPanel } from '@/components/OfficialThreadPanel';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { GroupAssignment } from '@/components/GroupAssignment';
import { GroupPrefs } from '@/components/GroupPrefs';
import { HostNote } from '@/components/HostNote';
import { PaymentTracker } from '@/components/PaymentTracker';
import { CarDispatch } from '@/components/CarDispatch';
import { PickupStationPicker } from '@/components/PickupStationPicker';
import { NumberInput } from '@/components/NumberInput';
import { RESTRICTION_MSG } from '@/lib/restrictions';
import { readApiError } from '@/lib/apiError';
import { MatchPicker } from '@/components/MatchPicker';
import { RoundAlbum } from '@/components/RoundAlbum';
import type { Round, User, PickupStatus } from '@/lib/types';

// Brand launch URL — handled by middleware, redirects to liff.line.me/{id}
// while preserving the ?to= query so the recipient lands directly on the
// round detail page after LIFF login.
const SHARE_BASE = 'https://goltomo.com/app';

function isProfileComplete(age?: number): boolean {
  // We treat "age set to a positive value" as the proxy for "profile saved".
  // The profile edit form requires age before allowing save, so this matches.
  return typeof age === 'number' && age > 0;
}

const allAreas = ['東京都', '神奈川県', '千葉県', '埼玉県', '茨城県', '栃木県', '群馬県', '静岡県', '山梨県', 'その他'];

export default function RoundDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const storeUsers = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const restrictions = useStore((s) => s.restrictions);
  const hydrated = useStore((s) => s.hydrated);
  const me = useStore(getMe);
  const profileReady = isProfileComplete(me?.age);
  // ゴルフ場への届出用に漢字フルネームが必要。参加申込のゲートに使う。
  const hasKanjiName = !!(me?.realNameLast?.trim() && me?.realNameFirst?.trim());
  const joinReady = profileReady && hasKanjiName;
  // 参加申込時のピックアップ回答モーダル。
  const [pickupOpen, setPickupOpen] = useState(false);
  const autoJoinHandled = useState({ done: false })[0];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // 招待は「招待ボタン→この人へのメッセージ入力→1人ずつ送信」。inviteTarget=送信先。
  const [inviteTarget, setInviteTarget] = useState<{ id: string; name: string } | null>(null);
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [interestedOpen, setInterestedOpen] = useState(false);
  // 主催者限定：この募集を「見に来た人」一覧（誰がいつ見たか）。招待の起点にできる。
  const [viewers, setViewers] = useState<{ user: User; at: number; count: number }[] | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  // ゲスト枠→登録ユーザーの置き換え（主催者）。target: 名前付きゲスト(guestId) or 知り合い枠(external)。
  const [replaceTarget, setReplaceTarget] = useState<{ guestId?: string; label: string } | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  // 主催者向け「ラウンドは完了しましたか？」プロンプトを「まだ」で閉じたか（この画面表示中のみ）。
  const [completionDismissed, setCompletionDismissed] = useState(false);
  // 詳細のセクション切り替えタブ（参加してる人／ピックアップ／組み分け／入金）。
  const [tab, setTab] = useState<'people' | 'pickup' | 'groups' | 'hostnote' | 'album' | 'payment'>(
    () => {
      const t = search?.get('tab');
      return t === 'groups' || t === 'pickup' || t === 'hostnote' || t === 'payment' ? t : 'people';
    },
  );
  // Host-only: kanji full names of participants (for golf-course registration).
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  // Fallback fetch: a friend who arrived via a shared link before completing
  // profile registration won't have this round in their store (bootstrap's
  // cohort filter strips it). Pull it directly so the page can still render.
  const [fetchedRound, setFetchedRound] = useState<Round | null>(null);
  const [fetchedUsers, setFetchedUsers] = useState<User[]>([]);
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'notfound' | 'error'>('idle');

  useEffect(() => {
    if (storeRound || !params.id) { setFetchState('idle'); return; }
    let cancelled = false;
    setFetchState('loading');
    (async () => {
      try {
        const r = await fetch(`/api/rounds/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
        if (cancelled) return;
        if (r.status === 404) { setFetchState('notfound'); return; }
        if (!r.ok) { setFetchState('error'); return; }
        const j = await r.json();
        setFetchedRound(j.round || null);
        setFetchedUsers(Array.isArray(j.users) ? j.users : []);
        setFetchState('idle');
      } catch {
        if (!cancelled) setFetchState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [params.id, storeRound]);

  // Host-only: pull participants' kanji full names. The endpoint is host-gated
  // (returns 403 otherwise), so real names never reach non-hosts.
  useEffect(() => {
    const r = storeRound || fetchedRound;
    if (!params.id || !r || !isRoundHost(r, meId)) { setParticipantNames({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rounds/${encodeURIComponent(params.id)}/participant-names`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const j = await res.json();
        if (!cancelled) setParticipantNames(j.names || {});
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [
    params.id, meId, storeRound, fetchedRound,
    (storeRound || fetchedRound)?.applicantIds?.length,
    (storeRound || fetchedRound)?.pendingApplicantIds?.length,
  ]);

  // 「見に来た人」記録：ログイン済みで主催者でない人がこの募集を開いたら、静かに記録する
  // （通知はしない）。募集ごと・ログインユーザーごとに1回だけ送る。
  useEffect(() => {
    const r = storeRound || fetchedRound;
    if (!r || !meId || isRoundHost(r, meId)) return;
    fetch(`/api/rounds/${encodeURIComponent(r.id)}/view`, { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(storeRound || fetchedRound)?.id, meId]);

  // 主催者限定：この募集を見に来た人の一覧を取得（他ユーザーには 403 で返らない）。
  useEffect(() => {
    const r = storeRound || fetchedRound;
    if (!params.id || !r || !isRoundHost(r, meId)) { setViewers(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rounds/${encodeURIComponent(params.id)}/viewers`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const j = await res.json();
        if (!cancelled) setViewers(Array.isArray(j.viewers) ? j.viewers : []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [
    params.id, meId, storeRound, fetchedRound,
    (storeRound || fetchedRound)?.applicantIds?.length,
    (storeRound || fetchedRound)?.invitedIds?.length,
  ]);

  // 主催者・参加者・気になる・招待中などの評価を「また回りたい率」でリアルタイム表示する
  // （user.reviewAvg は非正規化で古くなるため使わない）。表示ユーザーぶんを一括取得。
  const [ratings, setRatings] = useState<Record<string, { roundedWith: number; againCount: number; neverCount: number }>>({});
  useEffect(() => {
    const r = storeRound || fetchedRound;
    if (!r) return;
    const ids = Array.from(new Set([
      r.hostId,
      ...(r.applicantIds || []),
      ...(r.pendingApplicantIds || []),
      ...(r.interestedIds || []),
      ...(r.invitedIds || []),
    ].filter(Boolean)));
    if (ids.length === 0) return;
    let cancelled = false;
    fetch('/api/users/ratings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }), cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (!cancelled && d?.ratings) setRatings(d.ratings); })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, [
    (storeRound || fetchedRound)?.id,
    (storeRound || fetchedRound)?.applicantIds?.length,
    (storeRound || fetchedRound)?.pendingApplicantIds?.length,
    (storeRound || fetchedRound)?.interestedIds?.length,
    (storeRound || fetchedRound)?.invitedIds?.length,
  ]);
  // 評価ラベル（取得できるまでは何も出さない＝古い値をチラ見せしない）。
  const ratingText = (id: string, count = false): string => {
    const r = ratings[id];
    return r ? revisitRatingLabel(r, { count }) : '';
  };

  const round = storeRound || fetchedRound;

  // プロフィール入力から autojoin=1 で戻ってきたら、ピックアップ回答モーダルを
  // 自動で開いて申込フローを続ける（ユーザーは参加ボタンを押し直さなくてよい）。
  useEffect(() => {
    if (autoJoinHandled.done) return;
    if (!hydrated || !meId) return;
    if (search?.get('autojoin') !== '1') return;
    const r = storeRound || fetchedRound;
    if (!r) return; // ラウンド読み込み待ち
    autoJoinHandled.done = true;
    router.replace(`/round/${r.id}`); // リロードで再発火しないようパラメータを除去
    const participating = isRoundHost(r, meId) || r.applicantIds.includes(meId) || (r.pendingApplicantIds || []).includes(meId);
    const full = r.currentCount >= r.maxSpots;
    if (participating || full || r.status !== 'open') return;
    if (!joinReady) return; // 名前がまだ未入力なら開かない
    setPickupOpen(true);
  }, [hydrated, meId, search, storeRound, fetchedRound, joinReady, router, autoJoinHandled]);

  // Merge users so the host/applicant lookups work whether the data came from
  // the store (bootstrap) or the fallback fetch.
  const users = storeRound ? storeUsers : [...storeUsers, ...fetchedUsers.filter((u) => !storeUsers.find((s) => s.id === u.id))];

  if (!round) {
    if (fetchState === 'loading') {
      return <div className="p-5 text-center text-sub">読み込み中...</div>;
    }
    return <div className="p-5 text-center text-sub">募集が見つかりません</div>;
  }

  const host = users.find((u) => u.id === round.hostId);
  // 共同管理者は「主催者」欄にまとめて表示するため、参加確定リストからは除外する。
  const coHostIds = round.coHostIds || [];
  const coHosts = coHostIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const applicants = round.applicantIds.filter((id) => !coHostIds.includes(id)).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const pendingApplicants = (round.pendingApplicantIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const isHost = isRoundHost(round, meId);
  // 運営が代理で立てた枠（公式スレッド）。主催者がいない企画なので、
  // 募集中〜日程調整中のあいだは参加まわりの操作を専用パネルに寄せる。
  const officialStage = ((round as any).official?.stage as string | undefined);
  const isOfficialThread = !!officialStage;
  const officialActive = officialStage === 'recruiting' || officialStage === 'deciding';
  // 運営枠は、**人がそろうまで顔ぶれを伏せる**。
  // 先に入った人の顔を見てから決められると、この企画の狙い（誰でも横並びで
  // 手を挙げられる）が崩れる。まだ入っていない人に会員の顔と名前を見せる理由もない。
  // 自分が入っていれば見える（入った時点でグループチャットに合流して分かるので、
  // ここだけ伏せても意味がない）。定員に達したら全員に開く。
  const officialFilled = (() => {
    const o = (round as any).official;
    if (!o?.slots) return false;
    const seats = o.slots.reduce((a: number, x: any) => a + (x.count || 0), 0);
    return seats > 0 && (round.applicantIds || []).length >= seats;
  })();
  const hideOfficialMembers = isOfficialThread && officialActive && !officialFilled
    && !isHost && !round.applicantIds.includes(meId);
  const isApproved = round.applicantIds.includes(meId);
  const isPending = (round.pendingApplicantIds || []).includes(meId);
  // 参加者同士のDMは「主催者/共同管理者 or 承認済み参加者」だけに開放する。未参加の閲覧者は
  // 参加者一覧からDMを送れない（問い合わせは主催者欄の💬に集約）。
  const canDmMembers = isHost || isApproved;
  // 主催者への💬：募集中(open)は誰でも可（問い合わせ）。締切/完了後はメンバー・申請中・招待中のみ
  // （lib/dmPolicy のサーバー判定と同じ範囲に揃える）。
  const canDmHost = round.status === 'open' || canDmMembers || isPending || (round.invitedIds || []).includes(meId);
  // 飲み会（eventType='drink'）: 定員なし・ゴルフ場/組み分け/送迎/レビュー無し。
  const isDrink = round.eventType === 'drink';
  // 画面下に貼りつく参加ボタンを出すか。
  // 募集を読んでいるうちにボタンが画面外へ消えてしまい、戻ってこない人がいた
  // （実測：ボタンが出ている状態で開いた14人のうち押したのは4人）。
  // インラインのボタンはそのまま残し、常に押せる導線を下に足す。
  const isFull = !isDrink && round.currentCount >= round.maxSpots;
  const remaining = round.maxSpots - round.currentCount;
  const isComp = !isDrink && round.maxSpots >= 5;
  // 招待された本人（まだ参加していない）。招待者は承認待ちを経由せず即参加できる。
  const isInvited = !!meId && (round.invitedIds || []).includes(meId) && !isHost && !isApproved && !isPending;
  // 主催者向け「ラウンドは完了しましたか？」プロンプト：まだ open で、スタート時間+6.5hを過ぎたら出す。
  const startMs = (() => {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(round.date || '');
    const tm = /^(\d{1,2}):(\d{2})/.exec(round.startTime || '');
    if (!dm || !tm) return null;
    const utc = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1] - 9, +tm[2]);
    return Number.isFinite(utc) ? utc : null;
  })();
  const showCompletionPrompt = isHost && round.status === 'open'
    && startMs != null && hydrated && Date.now() >= startMs + 6.5 * 3600 * 1000
    && !completionDismissed;
  const isFlexible = round.type === 'flexible';
  const dateLabel = round.dateType === 'range' ? round.dateRange : formatDate(round.date);
  const canChatGroup = isHost || isApproved;

  // ♡「気になる」state + people who marked interest (publicly visible).
  const iAmInterested = (round.interestedIds || []).includes(meId);
  const interestedUsers = (round.interestedIds || [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean) as User[];
  // 招待中に出すのは「まだ参加していない」招待者だけ。すでに主催者／参加確定／申請中の
  // 人は除外（コース未定→確定の切替などで重複表示されるのを防ぐ）。
  const invitedUsers = (round.invitedIds || [])
    .filter((id) => id !== round.hostId
      && !(round.applicantIds || []).includes(id)
      && !(round.pendingApplicantIds || []).includes(id))
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean) as User[];
  // Membership sets used to style invite buttons (participating → grey out).
  const participatingIds = new Set<string>([
    ...(round.applicantIds || []),
    ...(round.pendingApplicantIds || []),
  ]);
  const invitedSet = new Set<string>(round.invitedIds || []);
  // What kind of invite button a candidate gets.
  function inviteState(id: string): 'joined' | 'invited' | 'open' {
    if (participatingIds.has(id)) return 'joined';
    if (invitedSet.has(id)) return 'invited';
    return 'open';
  }

  // Visitors arriving from a shared link may not be logged in. Defer login
  // until they actually act. Returns true if it redirected to login.
  function requireLogin(): boolean {
    if (meId) return false;
    router.push(`/login?callbackUrl=${encodeURIComponent(`/round/${round!.id}`)}`);
    return true;
  }

  // プロフィール（＋漢字フルネーム）入力へ誘導。保存後は autojoin=1 で戻り、
  // ピックアップ回答モーダルが自動で開いて申込まで続く。
  function goProfileForJoin() {
    const back = `/round/${round!.id}?autojoin=1`;
    router.push(`/mypage/edit?returnTo=${encodeURIComponent(back)}`);
  }

  async function join() {
    if (requireLogin()) return;
    // 制限がかかっている場合は、申請の前に止める。
    if (restrictions.noApplyAll) { toast(RESTRICTION_MSG.noApplyAll, 'error'); return; }
    if ((restrictions.applyBlockHostIds || []).includes(round!.hostId)) { toast(RESTRICTION_MSG.applyBlockHostIds, 'error'); return; }
    track('join_round_click', { roundId: round!.id, hostId: round!.hostId });
    // ゲート：プロフィール未登録 or ゴルフ場届出用の漢字フルネーム未入力なら
    // プロフィール編集へ。保存後に戻って自動継続する。
    if (!joinReady) {
      track('join_round_profile_gate', { roundId: round!.id, reason: !profileReady ? 'profile' : 'name' });
      toast(!profileReady ? '参加にはプロフィール登録が必要です' : 'ゴルフ場への届出用に、お名前（漢字フルネーム）の入力が必要です');
      goProfileForJoin();
      return;
    }
    // 飲み会は送迎（ピックアップ）の概念がないので、確認モーダルを挟まず即申込む。
    if (isDrink) { submitJoin({}); return; }
    // 準備OK → ピックアップ回答モーダルへ（回答と一緒に申込む）。
    setPickupOpen(true);
  }

  // ピックアップ回答を添えて参加を確定する。招待された人は承認待ちを経由せず即参加。
  async function submitJoin(pickup: { status?: PickupStatus; stations?: string[]; capacity?: number }) {
    try {
      if (isInvited) {
        await store.acceptInvite(round!.id, pickup);
        track('accept_invite_success', { roundId: round!.id });
        setPickupOpen(false);
        toast('参加しました🎉');
      } else {
        await store.joinRound(round!.id, pickup);
        track('join_round_success', { roundId: round!.id });
        setPickupOpen(false);
        toast('参加申請を送信しました');
      }
    } catch (e) {
      track('join_round_error', { message: (e as Error).message });
      toast((e as Error).message, 'error');
    }
  }
  async function shareRound() {
    // Direct public URL — opens & is viewable instantly, no LINE login required.
    // Login is only requested when the visitor takes an action (apply, etc.).
    const url = `https://app.goltomo.com/round/${round!.id}`;
    const text = `${round!.eventType === 'drink' ? '🍻' : '⛳'} ${round!.title}\n${dateLabel}${round!.startTime ? ' ' + round!.startTime : ''}`;
    track('share_round_click', { roundId: round!.id });
    const w = window as any;
    if (w.navigator?.share) {
      try {
        await w.navigator.share({ title: 'ゴルトモ ラウンド募集', text, url });
        track('share_round_native_ok', { roundId: round!.id });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('リンクをコピーしました');
      track('share_round_clipboard_ok', { roundId: round!.id });
    } catch {
      // Clipboard failed (e.g. webview without permission). Show the URL so
      // the user can long-press to copy manually.
      window.prompt('このリンクをコピーして共有してください', url);
    }
  }
  // LINEなどにそのまま貼れる、簡潔なテキストを組み立ててクリップボードへコピー。
  // 日時・スタート時間・ゴルフ場・金額を含める（金額は男女別なら両方併記）。
  async function copyShareText() {
    const r = round!;
    const url = `https://app.goltomo.com/round/${r.id}`;
    const isDrink = r.eventType === 'drink';
    const place = isDrink
      ? (r.venue ? `${r.venue}${r.area ? `（${r.area}）` : ''}` : (r.area || '場所未定'))
      : r.type === 'confirmed'
        ? `${r.courseName || 'コース調整中'}${r.area ? `（${r.area}）` : ''}`
        : (r.area || 'エリア未定');
    const priceStr = priceLabelForGender(r, undefined); // 両性別を併記（受け取る側に合わせて判断できる）
    // 参加人数と男女内訳（主催者＋承認済み参加者＋知り合い枠）。
    let male = r.externalMale || 0;
    let female = r.externalFemale || 0;
    for (const id of [r.hostId, ...(r.applicantIds || [])]) {
      const u = users.find((x) => x.id === id);
      if (u?.gender === 'male') male++;
      else if (u?.gender === 'female') female++;
    }
    const lines = [
      `${isDrink ? '🍻' : '⛳'} ${r.title}`,
      `📅 ${dateLabel}${r.startTime ? ` ${r.startTime}` : ''}`,
      `📍 ${place}`,
      priceStr ? `💰 参加費 ${priceStr}` : '',
      `👥 参加 ${r.currentCount}/${r.maxSpots}人（👨 男性${male}・👩 女性${female}）`,
      '',
      url,
    ].filter((l) => l !== '');
    const text = lines.join('\n');
    track('share_round_text', { roundId: r.id });
    try {
      await navigator.clipboard.writeText(text);
      toast('テキストをコピーしました');
    } catch {
      window.prompt('このテキストをコピーして共有してください', text);
    }
  }
  async function leave() {
    if (!(await confirmDialog('このラウンドから抜けますか？'))) return;
    try { await store.leaveRound(round!.id); toast('離脱しました'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function close() {
    if (!(await confirmDialog('この募集を閉じますか？'))) return;
    try { await store.closeRound(round!.id); toast('募集を閉じました'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function deletePost() {
    if (!(await confirmDialog('この投稿を削除しますか？\n募集・グループチャットを含めて完全に削除され、元に戻せません。'))) return;
    try { await store.deleteRound(round!.id); toast('投稿を削除しました'); router.push('/home'); }
    catch (e) { toast('削除に失敗しました: ' + (e as Error).message, 'error'); }
  }
  async function complete() {
    const drink = round!.eventType === 'drink';
    const msg = drink ? 'この飲み会を完了にしますか？' : 'ラウンドを完了しますか？\n参加者全員にレビュー依頼が送られます。';
    if (!(await confirmDialog(msg))) return;
    try { await store.completeRound(round!.id); toast(drink ? '飲み会を完了しました' : 'ラウンド完了'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function approve(userId: string) {
    try { await store.approveApplicant(round!.id, userId); track('approve_applicant', { roundId: round!.id }); toast('承認しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function reject(userId: string) {
    if (!(await confirmDialog('この申請を断りますか？'))) return;
    try { await store.rejectApplicant(round!.id, userId); toast('却下しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function kick(userId: string, name: string) {
    if (!(await confirmDialog(`${name}さんをラウンドから外しますか？`))) return;
    try { await store.kickApplicant(round!.id, userId); toast('外しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function onToggleInterest() {
    if (requireLogin()) return;
    if (restrictions.noInterest) { toast(RESTRICTION_MSG.noInterest, 'error'); return; }
    const next = !(round!.interestedIds || []).includes(meId);
    track('interest_toggle', { roundId: round!.id, on: next });
    if (storeRound) {
      try { await store.toggleInterest(round!.id, next); }
      catch (e) { toast((e as Error).message, 'error'); }
    } else {
      // Round not in store (arrived via shared link) — call API + patch local copy.
      try {
        const res = await fetch(`/api/rounds/${round!.id}/interest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interested: next }), cache: 'no-store',
        });
        if (!res.ok) { toast(await readApiError(res), 'error'); return; }
        const j = await res.json();
        if (j.round) setFetchedRound((prev) => (prev ? { ...prev, ...j.round } : j.round));
      } catch (e) { toast((e as Error).message, 'error'); }
    }
  }
  async function invite(userId: string, name: string, message?: string) {
    if (restrictions.noInvite) { toast(RESTRICTION_MSG.noInvite, 'error'); return; }
    try {
      const updated = await store.inviteToRound(round!.id, userId, (message || '').trim() || undefined);
      if (!storeRound && updated) setFetchedRound((prev) => (prev ? { ...prev, ...updated } : prev));
      track('invite_send', { roundId: round!.id });
      toast(`${name}さんを招待しました`);
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  // ゲスト枠（名前付きゲスト or 知り合い枠）を登録ユーザーに置き換える。
  async function doReplaceGuest(userId: string, name: string) {
    if (!replaceTarget) return;
    setReplaceBusy(true);
    try {
      const updated = await store.replaceGuest(round!.id, { userId, guestId: replaceTarget.guestId });
      if (!storeRound && updated) setFetchedRound((prev) => (prev ? { ...prev, ...updated } : prev));
      track('replace_guest', { roundId: round!.id, kind: replaceTarget.guestId ? 'named' : 'external' });
      toast(`${replaceTarget.label} を ${name}さん に置き換えました`);
      setReplaceTarget(null);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setReplaceBusy(false); }
  }

  // 招待済みの相手の「招待」を再度押したとき：確認のうえ招待を取り消す。
  async function uninvite(userId: string, name: string) {
    if (!(await confirmDialog(`${name}さんへの招待を取り消しますか？`))) return;
    try {
      const updated = await store.uninviteFromRound(round!.id, userId);
      if (!storeRound && updated) setFetchedRound((prev) => (prev ? { ...prev, ...updated } : prev));
      toast(`${name}さんへの招待を取り消しました`);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
        <div className="flex items-center gap-2">
          {!isHost && (
            <button
              onClick={onToggleInterest}
              className={'px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border-[1.5px] ' + (iAmInterested ? 'bg-pink-100 border-pink-500 text-pink-600' : 'bg-bg border-border')}
              aria-label="気になる"
            >
              <span>{iAmInterested ? '❤️' : '🤍'}</span>
              <span>気になる</span>
            </button>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="px-3 py-1.5 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold flex items-center gap-1"
            aria-label="この募集を友達にシェア"
          >
            <span>🔗</span>
            <span>シェア</span>
          </button>
          {isHost && round.status !== 'completed' && (
            <button
              onClick={() => router.push(`/round/${round.id}/edit`)}
              className="w-9 h-9 bg-bg border-[1.5px] border-border rounded-full text-sm font-bold flex items-center justify-center"
              aria-label="この投稿を編集"
            >
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* 招待された本人向け：主催者からの招待＋一言メッセージを画面内に表示（URLから開いた人にも見える）。 */}
      {!!meId && (round.invitedIds || []).includes(meId) && round.hostId !== meId
        && !(round.applicantIds || []).includes(meId) && !(round.pendingApplicantIds || []).includes(meId) && (
        <div className="bg-green-light border-[1.5px] border-green rounded-card p-4 mb-4">
          <div className="text-[13px] font-black text-green mb-1.5">💌 {host?.displayName || '主催者'}さんから招待されています</div>
          {(round.inviteMessages || {})[meId] && (
            <div className="text-[13px] text-text bg-card rounded-xl p-3 whitespace-pre-wrap leading-relaxed shadow-card">
              {(round.inviteMessages || {})[meId]}
            </div>
          )}
        </div>
      )}

      {/* 未ログイン通知：共有リンクをブラウザで開いた人向け。ログインすると
          参加・ピックアップなどの操作ができる。ログイン後はこのページへ戻る。 */}
      {hydrated && !meId && (
        <div className="mb-4 bg-orange-light border-[1.5px] border-orange rounded-card p-4">
          <div className="text-[13px] font-black text-orange mb-1">🔒 未ログインです</div>
          <div className="text-[12px] text-sub leading-relaxed mb-3">
            ログインすると、参加申込・ピックアップの登録・「気になる」などの操作ができます。
          </div>
          <a
            href={`/liff?to=${encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname + window.location.search : `/round/${params.id}`)}`}
            className="block w-full py-3 bg-green text-white rounded-xl text-sm font-black text-center"
          >
            ここからログインする →
          </a>
          <div className="text-[10px] text-muted text-center mt-1.5">ログイン後、このページに戻ります</div>
        </div>
      )}

      <div className="bg-card rounded-card p-5 shadow-card">
        {isDrink && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white mb-3">🍻 飲み会・親睦会</span>
        )}
        {isComp && !isDrink && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white mb-3">🏆 コンペ・イベント</span>
        )}
        {isFlexible && !isDrink && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-[#EFEFEC] text-sub mb-3 ml-2">📍 コース未定</span>
        )}
        <div className="text-xl font-black mb-4">{round.title}</div>

        {/* 自由記入のコメント（投稿の一番上に表示） */}
        {round.description && (
          <div className="mb-4 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed whitespace-pre-wrap">{round.description}</div>
        )}

        {officialActive && <OfficialThreadPanel roundId={round.id} />}

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <Cell label="日時">{dateLabel} {round.startTime || ''}</Cell>
          {isDrink ? (
            <Cell label="お店・場所">{round.venue || round.area || '未定'}</Cell>
          ) : (
            <Cell label={round.type === 'confirmed' ? 'コース' : 'エリア'}>{round.type === 'confirmed' ? round.courseName : round.area}</Cell>
          )}
          {!isDrink && <Cell label="レベル">{levelConditionLabel(round)}</Cell>}
          <Cell label="費用目安">{priceLabelForGender(round, me?.gender) || '—'}{!isDrink && isSplitPrice(round) && me?.gender ? <span className="ml-1 text-[9px] text-muted font-bold">（{me.gender === 'female' ? '女性' : '男性'}）</span> : null}</Cell>
        </div>

        {/* 集合場所・集合時間（日時のすぐ下）。主催者が記入していれば表示。 */}
        {round.meetingInfo && (
          <div className="mb-4 bg-green-light rounded-xl p-3 border-[1.5px] border-green">
            <div className="text-[11px] text-green font-black mb-1">📍 集合場所・集合時間</div>
            <div className="text-sm font-bold text-text whitespace-pre-wrap">{round.meetingInfo}</div>
          </div>
        )}

        {/* Gender breakdown across host + approved applicants. Always shown
            (incl. competitions) so you can see the mix at a glance. */}
        {(() => {
          const ids = [round.hostId, ...round.applicantIds];
          let m = 0, f = 0, o = 0;
          for (const id of ids) {
            const u = users.find((x) => x.id === id);
            if (!u) { o++; continue; }
            if (u.gender === 'male') m++;
            else if (u.gender === 'female') f++;
            else o++;
          }
          // 主催者の知り合い（男女）も全体の構成に算入
          const exM = round.externalMale || 0;
          const exF = round.externalFemale || 0;
          const exLegacy = (exM + exF === 0) ? (round.externalCount || 0) : 0;
          m += exM; f += exF; o += exLegacy;
          return (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-sub mb-1.5">現在の参加内訳</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-light text-blue">👨 男 {m}</span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-pink-100 text-pink-600">👩 女 {f}</span>
                {o > 0 && (
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-bg text-sub">未設定 {o}</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* 募集の性別内訳（ターゲット枠）は詳細画面では非表示。主催者の編集画面でのみ扱う
            （ぱっと見で「実際の参加内訳」と混同して分かりにくいため）。 */}

        {/* 参加状況。飲み会は定員なしなので人数だけ、ゴルフは「何人中何人」＋バー。
            参加ボタンをオレンジにしたので、ここは主役を譲って落ち着いた色にする。
            並べて同じ色にすると、どちらを押せばいいのか分からなくなる。
            ただし満員が近いときだけはオレンジに戻す（そこは急ぐ情報のため）。 */}
        {(() => {
          const rate = round.currentCount / Math.max(1, round.maxSpots);
          const urgent = !isDrink && rate >= 0.75;
          return (
            <div className="mb-4">
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs font-semibold text-sub">参加状況</span>
                <span className={'text-sm font-black ' + (urgent ? 'text-orange' : 'text-sub')}>
                  {isDrink ? `🍻 ${round.currentCount}人 参加中` : `${round.currentCount}/${round.maxSpots}人 参加中`}
                </span>
              </div>
              {!isDrink && (
                <div className="w-full h-2 bg-bg rounded overflow-hidden">
                  <div className={'h-full rounded ' + (urgent ? 'bg-orange' : 'bg-muted')}
                    style={{ width: `${Math.round(rate * 100)}%` }} />
                </div>
              )}
            </div>
          );
        })()}

        {/* コミュニケーション導線（常時表示） */}
        {canChatGroup && (
          <Link href={`/round/${round.id}/chat`} className="flex items-center gap-2 p-3 bg-green-light text-green rounded-xl mb-2 font-bold text-sm">
            <span className="text-lg">💬</span>
            <span className="flex-1">ラウンドチャット（参加者全員）</span>
            <span>›</span>
          </Link>
        )}
        {canChatGroup && round.openChatUrl && (
          <a
            href={round.openChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-bg border border-border rounded-xl mb-4 text-text"
          >
            <span className="w-9 h-9 rounded-[9px] bg-[#06C755] text-white flex items-center justify-center text-[11px] font-black flex-shrink-0">LINE</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black">LINEオープンチャット</div>
              <div className="text-[11px] text-muted">LINEオープンチャットはこちら</div>
            </div>
            <span className="text-muted">↗</span>
          </a>
        )}

        {/* 主要アクション（参加・招待承認・主催者操作）をチャット付近に集約。
            以前は画面最下部にあり、下までスクロールしないと操作できなかったのを解消。 */}
        {showCompletionPrompt && (
          <div className="bg-green-light border-[1.5px] border-green rounded-card p-4 mb-3">
            <div className="text-sm font-black mb-1">{isDrink ? '🍻 飲み会は終わりましたか？' : '🏌️ ラウンドは完了しましたか？'}</div>
            <div className="text-[12px] text-sub mb-3 leading-relaxed">{isDrink ? '「完了しました」を押すと、募集を締めて記録に残します（写真アルバムは引き続き使えます）。' : '「完了しました」を押すと、参加者全員に「レビューをお願いします」の通知が届きます。'}</div>
            <div className="flex gap-2">
              <button onClick={() => setCompletionDismissed(true)} className="flex-1 py-3 bg-card border border-border text-sub rounded-xl text-sm font-bold">まだ</button>
              <button
                onClick={async () => { try { await store.completeRound(round!.id); toast('ラウンドを完了しました'); router.push('/home'); } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); } }}
                className="flex-1 py-3 bg-green text-white rounded-xl text-sm font-black"
              >完了しました</button>
            </div>
          </div>
        )}

        {/* 運営が代わりに立てた枠（代理ラウンド募集）に入っている人の抜け道。
            ここを丸ごと null にしていたせいで「参加を取りやめる」が消え、
            **入ったら抜けられない**状態になっていた（問い合わせで発覚）。
            主催者がいない枠なので、承認や完了のボタンは要らないが、
            抜けるだけは必ずできないといけない。 */}
        {officialActive && !isHost ? (
          isApproved ? (
            <div className="space-y-2 mb-4">
              <button onClick={leave}
                className="w-full py-3 bg-card text-red border border-red rounded-xl text-sm font-bold">
                この枠から抜ける
              </button>
              <div className="text-[11px] text-muted text-center leading-relaxed">
                抜けても、ほかの参加者には知らせません。<br />
                空いた枠は、また募集されます。
              </div>
            </div>
          ) : null
        ) : isHost ? (
          <div className="space-y-2 mb-4">
            {round.status === 'open' && (
              <button onClick={() => setInviteOpen(true)} className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                <span>💌</span> ゴルトモを招待する
              </button>
            )}
            {isFlexible && round.status === 'open' && (
              <button onClick={() => setConfirmOpen(true)} className="w-full py-4 bg-blue text-white rounded-xl text-[15px] font-bold">📅 コース確定にする</button>
            )}
            {(round.type === 'confirmed' || round.status !== 'open') && (
              <button onClick={complete} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold">{isDrink ? '飲み会を完了' : 'ラウンド完了'}</button>
            )}
            <button onClick={deletePost} className="w-full py-3 bg-red-50 text-red-600 border-[1.5px] border-red-300 rounded-xl text-sm font-bold">🗑 投稿を削除</button>
          </div>
        ) : isApproved ? (
          <div className="space-y-2 mb-4">
            <div className="text-center py-3 bg-green-light text-green rounded-xl text-sm font-bold">✅ 参加確定</div>
            <button onClick={leave} className="w-full py-3 bg-card text-red border border-red rounded-xl text-sm font-bold">参加を取りやめる</button>
          </div>
        ) : isPending ? (
          <div className="space-y-2 mb-4">
            <div className="text-center py-3 bg-yellow-light text-orange rounded-xl text-sm font-bold">⏳ 承認待ち</div>
            <button onClick={leave} className="w-full py-3 bg-card text-sub border border-border rounded-xl text-sm font-bold">申請を取り下げる</button>
          </div>
        ) : isFull ? (
          <div className="text-center py-3 bg-bg text-muted rounded-xl text-sm font-bold mb-4">満員のため受付終了</div>
        ) : (
          <div className="mb-4">
            {/* ボタンは画面でいちばん強い色にする。以前は濃いティールで、
                周りのカードもティール系だったため背景に溶けていた。
                文言も「◯◯を登録して参加する」をやめる。参加の前に“作業”を
                置くと、そこで止まってしまう（名前の登録は押したあとに聞く）。 */}
            <button onClick={join}
              className="w-full py-4 rounded-xl text-[16px] font-black text-white bg-orange border-2 border-[#C24E2C] shadow-[0_3px_0_#C24E2C]">
              {(() => {
                const slots = isDrink ? '' : `（残り${remaining}枠）`;
                return !meId
                  ? `LINEで参加する${slots}`
                  : isInvited ? `招待を承認して参加する${slots}` : `この募集に参加する${slots}`;
              })()}
            </button>
            {/* 押す前にいちばん気になること（確定するのか・取り消せるのか・
                お金がかかるのか）を先に潰す。 */}
            <div className="flex flex-wrap gap-1.5 justify-center mt-2.5">
              {(!meId
                ? ['まずは閲覧だけでもOK', '参加するときだけログイン']
                : isInvited
                  ? ['承認するとすぐ参加確定']
                  : ['主催者の承認制', 'あとで取り消せます', 'いま費用はかかりません']
              ).map((t) => (
                <span key={t} className="text-[10.5px] font-black bg-card border-[1.5px] border-hair rounded-full px-2.5 py-1 text-sub">
                  {t}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-muted text-center mt-2">
              {!meId
                ? '参加する時だけLINEログインが必要です'
                : joinReady
                  ? (isInvited
                      ? '招待されています。承認するとすぐに参加確定になります'
                      : isDrink ? '押すと主催者に申請が届きます' : '押したあと、送迎（ピックアップ）についてうかがいます')
                  : !profileReady
                    ? '押したあとにプロフィールを登録すると、戻ってきて参加できます'
                    : 'ゴルフ場に出す名簿に使うお名前を、押したあとにうかがいます'}
            </div>
          </div>
        )}

        {/* セクション切り替えタブ（参加してる人／ピックアップ／組み分け／主催者から） */}
        <div className="flex gap-1 mb-4 bg-bg rounded-xl p-1">
          {(([
            ['people', '参加してる人'],
            // 飲み会はピックアップ（送迎）・組み分けの概念がないので出さない。
            ...(isDrink ? [] : [['pickup', 'ピックアップ'], ['groups', '組み分け']]),
            // 「主催者から」はコンペ、または既に連絡が書かれている場合に表示。
            ...((round.isCompetition || round.hostNote) ? [['hostnote', '主催者から']] : []),
            // 入金管理がONのラウンドだけ。メンバー（主催者＋承認済み参加者）全員が見られる。
            ...((round.paymentEnabled && (isHost || isApproved)) ? [['payment', '💰 入金']] : []),
            // アルバムは参加者（主催者＋承認済み）だけに表示。
            ...((isHost || isApproved) ? [['album', '📷 アルバム']] : []),
          ] as const)).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={'flex-1 py-2 rounded-lg text-[11px] font-bold ' + (tab === k ? 'bg-card text-green shadow-sm' : 'text-sub')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── ピックアップ タブ ── */}
        {tab === 'pickup' && (
          <>
            {/* 🚗 送迎（主催者＋車ありの参加者） */}
            <PickupInfo round={round} meId={meId} users={users} isHost={isHost} isApproved={isApproved} />
            {/* 🚗 配車（車の割り振り）。主催者は編集、参加者は確認のみ。 */}
            {(isHost || isApproved) && round.status !== 'completed' && (
              <CarDispatch round={round} users={users as User[]} isHost={isHost} />
            )}
            {/* ゲストの送迎回答を、主催者がここで代理入力できるようにする。
                ゲストは自分でアプリを開けないので、誰かが代わりに答えないと
                永久に「未回答」のまま配車ボードの未割り当てに残る。
                機能自体は「参加してる人」タブにもあるが、配車を組んでいる最中に
                タブを行き来させられるのが実際のつまずきどころだったので、
                作業する場所に置く。 */}
            {isHost && round.status !== 'completed' && (round.guests || []).length > 0 && (
              <div className="bg-card rounded-card p-4 shadow-card mb-4">
                <div className="text-[13px] font-bold mb-1">👤 ゲストの送迎（主催者が代わりに入力）</div>
                <div className="text-[11px] text-sub mb-2.5 leading-relaxed">
                  ゲストは自分で答えられません。<b className="text-text">希望する駅は複数選べます</b>（一覧に無い駅も入力して追加できます）。
                </div>
                {(round.guests || []).map((g) => (
                  <div key={g.id} className="mb-2 last:mb-0">
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[12.5px] font-bold">{g.name}</span>
                      <span className="text-[10px] text-muted font-bold">ゲスト</span>
                      <span className="text-[10px] text-sub ml-auto">{pickupStatusLabel(round.participantPickups?.[g.id])}</span>
                    </div>
                    <PickupMemberControl round={round} member={{ id: g.id, displayName: g.name }} meId={meId} isHost={isHost} guest />
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted mt-1">※ 登録メンバーの送迎回答は「参加してる人」タブの各行からも確認・編集できます。</div>
          </>
        )}

        {/* ── 参加してる人 タブ（開始） ── */}
        {tab === 'people' && (
          <>
        {/* Host — official rounds show the branded ゴルトモ公式 identity instead
            of the admin's personal profile. */}
        {isOfficialThread ? null : round.isOfficial ? (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">主催者</div>
            <div className="flex items-center gap-2.5 p-3 bg-green-light rounded-xl">
              <OfficialAvatar size={44} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black flex items-center gap-1.5">
                  ゴルトモ公式 <OfficialBadge />
                </div>
                <div className="text-[11px] text-sub">ゴルトモ運営による公式ラウンド</div>
              </div>
            </div>
          </div>
        ) : (host || coHosts.length > 0) ? (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">主催者{coHosts.length > 0 ? `（${(host ? 1 : 0) + coHosts.length}名）` : ''}</div>
            {[...(host ? [host] : []), ...coHosts].map((h, idx) => h && (
              <div key={h.id} className="flex items-center gap-2.5 p-3 bg-bg rounded-xl mb-1.5">
                <Link href={`/profile/${h.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={h} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">{h.displayName}{idx > 0 && <span className="text-[10px] text-green font-bold flex-shrink-0">🤝 共同管理者</span>}</div>
                    <div className="text-[11px] text-sub truncate">{describeUser(h)}{ratingText(h.id, true) ? ' ・ ' + ratingText(h.id, true) : ''}{h.scoreRange ? ' ・ ' + h.scoreRange : ''}</div>
                  </div>
                </Link>
                {!!meId && h.id !== meId && canDmHost && (
                  <Link
                    href={`/chat/${chatIdFor(meId, h.id)}?other=${h.id}`}
                    className="px-3 py-1.5 bg-blue text-white rounded-lg text-xs font-bold flex-shrink-0"
                  >
                    💬 メッセージ
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* 運営枠で顔ぶれを伏せているあいだの代わり。
            何も出さないと「まだ誰もいない」に見えてしまうので、人数だけは伝える。 */}
        {hideOfficialMembers && applicants.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">参加確定（{applicants.length}名）</div>
            <div className="bg-bg border-2 border-hair rounded-[10px] p-3 text-[12px] font-bold text-sub leading-relaxed">
              👤 どなたが参加しているかは、<b className="text-text">人がそろってから</b>お知らせします。
            </div>
          </div>
        )}

        {/* Approved applicants + ゲスト。レビュー/初参加の代わりにピックアップ状態を表示。 */}
        {!hideOfficialMembers && (applicants.length > 0 || (round.guests?.length ?? 0) > 0) && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">参加確定（{applicants.length + (round.guests?.length ?? 0)}名）</div>
            {applicants.map((u) => u && (
              <div key={u.id} className="mb-1.5">
                <div className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px]">
                  <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Avatar user={u} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                      {isHost && participantNames[u.id] && (
                        <div className="text-[10px] text-green font-bold">📋 {participantNames[u.id]}</div>
                      )}
                      <div className="text-[10px] text-sub">{describeUser(u)} ・ {pickupStatusLabel(round.participantPickups?.[u.id])}</div>
                    </div>
                  </Link>
                  {canDmMembers && !isHost && u.id !== meId && (
                    <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                  )}
                  {isHost && (
                    <>
                      <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                      {!round.coHostIds?.includes(u.id) && (
                        <button onClick={() => kick(u.id, u.displayName)} className="px-2.5 py-1 bg-card text-red border border-red rounded text-[11px] font-bold flex-shrink-0">外す</button>
                      )}
                    </>
                  )}
                </div>
                {(isHost || u.id === meId) && round.status !== 'completed' && (
                  <PickupMemberControl round={round} member={u} meId={meId} isHost={isHost} />
                )}
              </div>
            ))}
            {(round.guests || []).map((g) => (
              <div key={g.id} className="mb-1.5">
                <div className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px]">
                  <div className="w-9 h-9 rounded-full bg-card flex items-center justify-center text-base flex-shrink-0 border border-border">👤</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{g.name} <span className="text-[10px] text-muted font-bold">ゲスト</span></div>
                    <div className="text-[10px] text-sub">{pickupStatusLabel(round.participantPickups?.[g.id])}</div>
                  </div>
                  {isHost && round.status !== 'completed' && (
                    <button onClick={() => setReplaceTarget({ guestId: g.id, label: `ゲスト「${g.name}」` })} className="px-2.5 py-1 bg-green text-white rounded text-[11px] font-bold flex-shrink-0">👤 登録者に置換</button>
                  )}
                </div>
                {isHost && round.status !== 'completed' && (
                  <PickupMemberControl round={round} member={{ id: g.id, displayName: g.name }} meId={meId} isHost={isHost} guest />
                )}
              </div>
            ))}
            {/* 知り合い枠のうち「まだ名前を入れていない人数」だけ表示（名前入り＝上のゲスト行と二重にしない）。
                当日アプリ登録した本人への置き換えもここから。 */}
            {(() => {
              const extTotal = (round.externalMale || 0) + (round.externalFemale || 0) + (round.externalCount || 0);
              const unnamed = Math.max(0, extTotal - (round.guests?.length ?? 0));
              if (!isHost || round.status === 'completed' || unnamed <= 0) return null;
              return (
                <div className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                  <div className="w-9 h-9 rounded-full bg-card flex items-center justify-center text-base flex-shrink-0 border border-border">🧑‍🤝‍🧑</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">主催者の知り合い <span className="text-[10px] text-muted font-bold">{unnamed}名</span></div>
                    <div className="text-[10px] text-sub">募集の編集→「募集人数」タブで名前を入れられます</div>
                  </div>
                  <button onClick={() => setReplaceTarget({ label: '知り合い枠' })} className="px-2.5 py-1 bg-green text-white rounded text-[11px] font-bold flex-shrink-0">👤 登録者に置換</button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Pending applicants — host only */}
        {isHost && pendingApplicants.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">申請中（{pendingApplicants.length}名）— 承認/却下を選んでください</div>
            {pendingApplicants.map((u) => u && (
              <div key={u.id} className="flex items-center gap-2 p-2.5 bg-yellow-light rounded-[10px] mb-1.5 flex-wrap">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={u} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                    {participantNames[u.id] && (
                      <div className="text-[10px] text-green font-bold">📋 {participantNames[u.id]}</div>
                    )}
                    <div className="text-[10px] text-sub">{describeUser(u)}{ratingText(u.id, true) ? ' ・ ' + ratingText(u.id, true) : ''}</div>
                  </div>
                </Link>
                <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                <button onClick={() => approve(u.id)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">承認</button>
                <button onClick={() => reject(u.id)} className="px-2.5 py-1 bg-card text-sub border border-border rounded-lg text-xs font-bold flex-shrink-0">却下</button>
              </div>
            ))}
          </div>
        )}

        {/* 招待中は主催者（＋共同管理者）だけに見せる。
            まだ参加していない人なので、他の閲覧者には「参加者」と紛らわしく、
            未ログインで募集を見に来た人にも無関係な人の名前が並んでしまう。
            主催者には招待の取り消し操作が必要なので残す。 */}
        {invitedUsers.length > 0 && isHost && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">💌 招待中（{invitedUsers.length}名）</div>
            {invitedUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={u} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                    <div className="text-[10px] text-sub">{describeUser(u)}{ratingText(u.id) ? ' ・ ' + ratingText(u.id) : ''}</div>
                  </div>
                </Link>
                {isHost ? (
                  <button
                    onClick={() => uninvite(u.id, u.displayName)}
                    className="px-3 py-1.5 bg-card text-red border border-red rounded-lg text-[11px] font-bold flex-shrink-0"
                  >招待を取り消し</button>
                ) : (
                  <span className="text-[10px] text-sub font-bold flex-shrink-0">招待済み</span>
                )}
              </div>
            ))}
          </div>
        )}


        {/* Anyone: open the 気になる list */}
        {interestedUsers.length > 0 && (
          <button
            onClick={() => setInterestedOpen(true)}
            className="w-full py-2.5 bg-bg rounded-xl mb-4 text-sm font-bold flex items-center justify-center gap-2 text-sub"
          >
            <span>❤️</span> 気になる {interestedUsers.length}人 <span className="text-muted">›</span>
          </button>
        )}

        {/* 主催者限定：この募集を見に来た人（誰がいつ見たか）。ここから招待できる。 */}
        {isHost && viewers && viewers.length > 0 && (
          <button
            onClick={() => setViewersOpen(true)}
            className="w-full py-2.5 bg-bg rounded-xl mb-4 text-sm font-bold flex items-center justify-center gap-2 text-sub"
          >
            <span>👀</span> 見に来た人 {viewers.length}人 <span className="text-muted">›</span>
          </button>
        )}
          </>
        )}

        {/* ── 組み分け タブ ── */}
        {tab === 'groups' && (
          <>
            {isComp && (isHost || isApproved) ? (
              <>
                {/* 組み分け希望：主催者は集計、参加者は自分の希望入力。 */}
                {meId && <GroupPrefs round={round} users={users as User[]} meId={meId} isHost={isHost} />}
                <GroupAssignment round={round} users={users as User[]} isHost={isHost} />
              </>
            ) : (
              <div className="text-center text-sub text-sm py-8 leading-relaxed">
                組み分け（スタート時間・コース）は、<br />5人以上のコンペ・イベントで<br />主催者・参加者が使えます。
              </div>
            )}
          </>
        )}

        {/* ── 主催者から タブ（注意事項・ルール等。主催者のみ編集・参加者は閲覧） ── */}
        {tab === 'hostnote' && (
          <HostNote round={round} isHost={isHost} />
        )}

        {/* ── 💰 入金 タブ（主催者がチェック・メンバー全員が閲覧） ── */}
        {tab === 'payment' && round.paymentEnabled && (isHost || isApproved) && (
          <PaymentTracker round={round} isHost={isHost} meId={meId} users={users} />
        )}

        {/* ── 📷 アルバム タブ（参加者で写真を共有） ── */}
        {tab === 'album' && (isHost || isApproved) && (
          <RoundAlbum roundId={round.id} meId={meId} isHost={isHost} />
        )}

      </div>

      {/* 飲み会は相互レビュー/マッチング（また回りたい等）を持たない。 */}
      {!isDrink && round.status === 'completed' && (isHost || isApproved) && (
        <div className="bg-card rounded-card p-4 mb-3 shadow-card">
          <div className="text-sm font-black mb-2">💘 ラウンド後のマッチング</div>
          <MatchPicker roundId={round.id} />
        </div>
      )}

      <div className="h-5" />

      {confirmOpen && (
        <ConfirmCourseModal
          roundId={round.id}
          initialPrice={round.price}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      {pickupOpen && (
        <PickupJoinModal me={me} onClose={() => setPickupOpen(false)} onSubmit={submitJoin} />
      )}

      {/* 画面下に貼りつく参加ボタン。スクロールしても押せる状態を保つ。
          .screen が唯一のスクロール領域で、タブバーはその外にあるため
          sticky bottom-0 でタブバーのすぐ上に止まる。 */}
      {round.status === 'open' && !officialActive && !isHost && !isApproved && !isPending && !isFull && (
        <div className="sticky bottom-0 -mx-5 mt-4 px-4 pt-2.5 pb-3 bg-card border-t-2 border-border">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-black leading-tight truncate">
                {dateLabel}{round.startTime ? ` ${round.startTime}` : ''}
                {!isDrink && <span className="text-orange"> ・残り{remaining}枠</span>}
              </div>
              <div className="text-[10px] font-bold text-sub mt-0.5">
                {joinReady ? 'あとで取り消せます' : '登録はすぐ終わります'}
              </div>
            </div>
            <button onClick={join}
              className="flex-none px-5 py-3 rounded-xl text-[14.5px] font-black text-white bg-orange border-2 border-[#C24E2C] shadow-[0_3px_0_#C24E2C]">
              {!meId ? 'LINEで参加' : joinReady ? (isInvited ? '招待を承認' : '参加する') : '参加する'}
            </button>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="absolute inset-0 bg-black/50 z-[150] flex items-center justify-center p-5 backdrop-blur-sm" onClick={() => setShareOpen(false)}>
          <div className="bg-card rounded-card p-5 w-full max-w-[350px] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-black mb-1 text-center">シェア方法を選ぶ</div>
            <div className="text-[12px] text-sub text-center mb-4">友達への送り方を選んでください</div>
            <button
              onClick={() => { setShareOpen(false); shareRound(); }}
              className="w-full py-3.5 bg-bg border-[1.5px] border-border rounded-xl text-sm font-bold mb-2 flex items-center justify-center gap-2"
            >
              🔗 URLをシェア<span className="text-[11px] text-muted font-medium">（リンクを送る）</span>
            </button>
            <button
              onClick={() => { setShareOpen(false); copyShareText(); }}
              className="w-full py-3.5 bg-green text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            >
              📋 テキストをコピー<span className="text-[11px] opacity-80 font-medium">（日時・場所・費用）</span>
            </button>
            <button onClick={() => setShareOpen(false)} className="w-full py-2.5 mt-2 text-muted text-xs font-bold">キャンセル</button>
          </div>
        </div>
      )}

      {inviteOpen && (
        <PickerModal title="ゴルトモを招待する" onClose={() => setInviteOpen(false)}>
          <div className="mb-3 text-[12px] text-sub bg-bg rounded-xl p-3 leading-relaxed">
            💌 招待したい人の「招待」を押すと、その人へのメッセージを入力して<b className="text-text">1人ずつ</b>送れます。
          </div>
          <InviteSearch inviteState={inviteState} onInvite={(id, name) => { setInviteMsg(''); setInviteTarget({ id, name }); }} onUninvite={(id, name) => uninvite(id, name)} />
        </PickerModal>
      )}

      {interestedOpen && (
        <PickerModal title={`❤️ 気になる（${interestedUsers.length}名）`} onClose={() => setInterestedOpen(false)}>
          {interestedUsers.length === 0 ? (
            <div className="text-center text-sub text-sm py-10">まだ「気になる」した人はいません。</div>
          ) : (
            interestedUsers.map((u) => {
              const st = inviteState(u.id);
              return (
                <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                  <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Avatar user={u} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                      <div className="text-[10px] text-sub">{describeUser(u)}{ratingText(u.id) ? ' ・ ' + ratingText(u.id) : ''}</div>
                    </div>
                  </Link>
                  {/* Host can invite interested people straight from this list. */}
                  {isHost && (
                    st === 'joined' ? (
                      <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">参加済み</span>
                    ) : st === 'invited' ? (
                      <button onClick={() => uninvite(u.id, u.displayName)} className="px-3 py-1.5 bg-card text-red border border-red rounded-lg text-xs font-bold flex-shrink-0">招待済み（取消）</button>
                    ) : (
                      <button onClick={() => { setInviteMsg(''); setInviteTarget({ id: u.id, name: u.displayName }); }} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">招待</button>
                    )
                  )}
                </div>
              );
            })
          )}
        </PickerModal>
      )}

      {/* 主催者限定：見に来た人の一覧（誰がいつ何回見たか）。ここから招待できる。 */}
      {viewersOpen && isHost && (
        <PickerModal title={`👀 見に来た人（${viewers?.length || 0}名）`} onClose={() => setViewersOpen(false)}>
          <div className="mb-3 text-[12px] text-sub bg-bg rounded-xl p-3 leading-relaxed">
            この募集を開いて見に来た人です（<b className="text-text">あなただけ</b>が見られます）。気になる人がいたら「招待」で声をかけられます。
          </div>
          {(!viewers || viewers.length === 0) ? (
            <div className="text-center text-sub text-sm py-10">まだ誰も見に来ていません。</div>
          ) : (
            viewers.map(({ user: u, at, count }) => {
              const st = inviteState(u.id);
              return (
                <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                  <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                    <Avatar user={u} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                      <div className="text-[10px] text-sub">{timeAgo(at)}に閲覧{count > 1 ? ` ・ ${count}回` : ''}</div>
                    </div>
                  </Link>
                  {st === 'joined' ? (
                    <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">参加済み</span>
                  ) : st === 'invited' ? (
                    <button onClick={() => uninvite(u.id, u.displayName)} className="px-3 py-1.5 bg-card text-red border border-red rounded-lg text-xs font-bold flex-shrink-0">招待済み（取消）</button>
                  ) : (
                    <button onClick={() => { setInviteMsg(''); setInviteTarget({ id: u.id, name: u.displayName }); }} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">招待</button>
                  )}
                </div>
              );
            })
          )}
        </PickerModal>
      )}

      {/* ゲスト枠 → 登録ユーザー 置き換えモーダル（主催者） */}
      {replaceTarget && isHost && (
        <PickerModal title={`👤 ${replaceTarget.label}を登録者に置き換え`} onClose={() => setReplaceTarget(null)}>
          <div className="mb-3 text-[12px] text-sub bg-bg rounded-xl p-3 leading-relaxed">
            当日アプリ登録した本人を選ぶと、その人が<b className="text-text">参加確定</b>に入り、完了時に<b className="text-text">レビュー</b>できます。除外→再招待は不要です。
          </div>
          <GuestReplacePicker
            excludeIds={new Set<string>([round.hostId, ...(round.applicantIds || []), ...(round.pendingApplicantIds || [])])}
            busy={replaceBusy}
            onPick={(id, name) => doReplaceGuest(id, name)}
          />
        </PickerModal>
      )}

      {/* 個別招待モーダル：この人にだけメッセージを添えて招待を送る（1人ずつ） */}
      {inviteTarget && (
        <div className="fixed inset-0 bg-black/50 z-[210] flex items-center justify-center p-5 backdrop-blur-sm" onClick={() => { if (!inviteBusy) setInviteTarget(null); }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-card w-full max-w-[340px] p-5 shadow-lg">
            <div className="text-base font-black mb-1">💌 {inviteTarget.name}さんを招待</div>
            <div className="text-[12px] text-sub mb-3 leading-relaxed">この人へのメッセージを添えて招待できます（任意）。</div>
            <textarea
              value={inviteMsg}
              onChange={(e) => setInviteMsg(e.target.value.slice(0, 200))}
              placeholder={`例: ${inviteTarget.name}さん、久しぶりに一緒に回りませんか？🏌️`}
              className="w-full h-20 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
            />
            <div className="text-[10px] text-muted text-right mt-0.5 mb-3">{inviteMsg.length}/200</div>
            <div className="flex gap-2">
              <button onClick={() => setInviteTarget(null)} disabled={inviteBusy} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold disabled:opacity-50">やめる</button>
              <button
                onClick={async () => { setInviteBusy(true); await invite(inviteTarget.id, inviteTarget.name, inviteMsg); setInviteBusy(false); setInviteTarget(null); }}
                disabled={inviteBusy}
                className="flex-[2] py-3 bg-green text-white rounded-xl text-sm font-black disabled:opacity-50"
              >{inviteBusy ? '送信中…' : '招待を送る'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bottom-sheet style picker modal (fixed → escapes the scrollable .screen clip,
// same fix as the notification settings sheet). Header + scrollable body.
function PickerModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-5 backdrop-blur-sm">
      <div
        style={{ maxHeight: '85dvh' }}
        className="bg-card rounded-t-3xl sm:rounded-card w-full max-w-[420px] max-h-[85vh] flex flex-col shadow-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="text-base font-black">{title}</div>
          <button onClick={onClose} className="text-muted text-xl leading-none px-1" aria-label="閉じる">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {children}
          {/* Tall spacer so the last row can always be scrolled clear of the
              LINE bottom bar / app tab bar (same fix as the notification sheet). */}
          <div className="h-40" />
        </div>
      </div>
    </div>
  );
}

function ScoreEntryCard({ round, host, applicants }: {
  round: import('@/lib/types').Round;
  host: import('@/lib/types').User | undefined;
  applicants: (import('@/lib/types').User | undefined)[];
}) {
  // Build the participant list = host + approved applicants. Host first so
  // their slot is always at the top regardless of join order.
  const people = [host, ...applicants].filter(Boolean) as import('@/lib/types').User[];

  // Local form state mirrors round.scores. Empty string means "no score yet".
  const initial: Record<string, string> = {};
  for (const p of people) {
    const v = round.scores?.[p.id];
    initial[p.id] = typeof v === 'number' && v > 0 ? String(v) : '';
  }
  const [drafts, setDrafts] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);

  // If the round.scores prop changes (e.g. another participant saved while
  // we had this open), re-sync the form so we don't clobber their input.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const p of people) {
      const v = round.scores?.[p.id];
      next[p.id] = typeof v === 'number' && v > 0 ? String(v) : '';
    }
    setDrafts(next);
    // people array identity changes every render but the ids list is stable
    // enough; we key on round.id + the serialised scores so we only re-sync
    // when something actually changed server-side.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, JSON.stringify(round.scores || {})]);

  async function save() {
    setBusy(true);
    try {
      // Convert empty strings to null so the API drops them; numbers stay.
      const payload: Record<string, number | null> = {};
      for (const [uid, raw] of Object.entries(drafts)) {
        const trimmed = raw.trim();
        if (!trimmed) { payload[uid] = null; continue; }
        const n = parseInt(trimmed, 10);
        if (!Number.isFinite(n)) continue;
        payload[uid] = n;
      }
      await store.saveRoundScores(round.id, payload);
      track('round_scores_save', { roundId: round.id, count: Object.values(payload).filter((v) => v !== null).length });
      toast('スコアを保存しました');
    } catch (e) {
      toast('保存失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 bg-card rounded-card p-4 shadow-card">
      <div className="text-base font-black mb-1 flex items-center gap-1.5">
        <span>📊</span><span>スコア入力</span>
      </div>
      <div className="text-[11px] text-sub leading-relaxed mb-3">
        参加者全員のその日のスコアを入力できます。誰でも全員分を編集できるので、
        覚えている人が代わりに入れてもOK。空欄のままでも大丈夫です。
        保存すると各メンバーのプロフィール「直近のスコア」にも自動で反映されます。
      </div>
      <div className="flex flex-col gap-1.5 mb-3">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 p-2.5 bg-bg rounded-[10px]">
            <Avatar user={p} size={32} />
            <div className="flex-1 min-w-0 text-[13px] font-semibold truncate">{p.displayName}</div>
            <input
              // type="text" with inputMode="numeric" — type="number" + min/max on
              // iOS Safari froze controlled inputs when the same digit repeated
              // ("11" → couldn't add 3 to make "113"). Filter to digits in onChange
              // instead; range/length checks live on the server (and are clamped
              // here too: max 3 chars, server rejects <30 / >200).
              type="text"
              inputMode="numeric"
              pattern="\\d*"
              maxLength={3}
              placeholder="—"
              value={drafts[p.id] ?? ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '').slice(0, 3);
                setDrafts((d) => ({ ...d, [p.id]: digits }));
              }}
              className="w-20 p-2 border-[1.5px] border-border rounded-lg text-center text-sm font-bold bg-card outline-none"
            />
          </div>
        ))}
      </div>
      <button
        onClick={save}
        disabled={busy}
        className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50"
      >
        {busy ? '保存中...' : 'スコアを保存'}
      </button>
      <div className="text-[10px] text-muted text-center mt-2">
        範囲外(30未満 / 200超)は保存されません。空欄にして保存すると登録済みのスコアが消えます。
      </div>
    </div>
  );
}

// 招待候補の検索。登録している全ユーザー（同年代）から性別・年齢・名前で絞り込み、
// 招待ボタンを出す。検索は /api/users/search。
type SearchUser = { id: string; displayName: string; avatar: string; avatarUrl?: string; age?: number; gender?: string; area?: string; scoreRange?: string; car?: string; reviewAvg?: number; reviewCount?: number };
function InviteSearch({ inviteState, onInvite, onUninvite }: { inviteState: (id: string) => 'joined' | 'invited' | 'open'; onInvite: (id: string, name: string) => void; onUninvite: (id: string, name: string) => void }) {
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [q, setQ] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [items, setItems] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (gender) p.set('gender', gender);
        if (q.trim()) p.set('q', q.trim());
        if (minAge) p.set('minAge', minAge);
        if (maxAge) p.set('maxAge', maxAge);
        const res = await fetch(`/api/users/search?${p.toString()}`, { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        setItems(d.items || []);
        setNote(d.note || '');
      } catch { if (!cancelled) setItems([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [gender, q, minAge, maxAge]);

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button onClick={onClick} className={'px-3 py-1.5 rounded-full text-xs font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}>{label}</button>
  );

  return (
    <div>
      <div className="text-[11px] text-sub mb-2">登録ユーザーから条件で探して招待できます（同年代のみ）。招待された人にはLINEで通知が届きます。</div>
      <div className="flex gap-1.5 mb-2">
        {chip('全員', gender === '', () => setGender(''))}
        {chip('👨 男性', gender === 'male', () => setGender('male'))}
        {chip('👩 女性', gender === 'female', () => setGender('female'))}
      </div>
      <div className="flex gap-1.5 mb-2 items-center">
        <input value={minAge} onChange={(e) => setMinAge(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))} inputMode="numeric" placeholder="最小" className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center" />
        <span className="text-xs text-sub">〜</span>
        <input value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))} inputMode="numeric" placeholder="最大" className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center" />
        <span className="text-xs text-sub">歳</span>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 名前で検索" className="w-full px-3 py-2 mb-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />

      {loading && <div className="text-center text-[11px] text-muted py-3">検索中...</div>}
      {!loading && note && <div className="text-center text-[12px] text-muted py-6">{note}</div>}
      {!loading && !note && items.length === 0 && <div className="text-center text-[12px] text-muted py-6">条件に合うユーザーがいません</div>}

      {items.map((u) => {
        const st = inviteState(u.id);
        return (
          <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
            <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
              <Avatar user={{ id: u.id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, color: '#2A8C82' } as any} size={36} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                <div className="text-[10px] text-sub truncate">
                  {[u.gender === 'male' ? '👨男性' : u.gender === 'female' ? '👩女性' : '', u.age ? `${u.age}歳` : '', u.area, u.car === 'have' ? '🚗' : ''].filter(Boolean).join(' ・ ')}
                </div>
              </div>
            </Link>
            {st === 'joined' ? (
              <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">参加済み</span>
            ) : st === 'invited' ? (
              <button onClick={() => onUninvite(u.id, u.displayName)} className="px-3 py-1.5 bg-card text-red border border-red rounded-lg text-xs font-bold flex-shrink-0">招待済み（取消）</button>
            ) : (
              <button onClick={() => onInvite(u.id, u.displayName)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">招待</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ゲスト枠の置き換え先を、登録ユーザーから選ぶピッカー。/api/users/search を使う。
// すでに参加している人（excludeIds）は候補から外す。
function GuestReplacePicker({ excludeIds, busy, onPick }: { excludeIds: Set<string>; busy: boolean; onPick: (id: string, name: string) => void }) {
  const [gender, setGender] = useState<'' | 'male' | 'female'>('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (gender) p.set('gender', gender);
        if (q.trim()) p.set('q', q.trim());
        const res = await fetch(`/api/users/search?${p.toString()}`, { cache: 'no-store', credentials: 'include' });
        const d = await res.json();
        if (cancelled) return;
        setItems(d.items || []);
        setNote(d.note || '');
      } catch { if (!cancelled) setItems([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [gender, q]);

  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button onClick={onClick} className={'px-3 py-1.5 rounded-full text-xs font-bold border-[1.5px] ' + (on ? 'bg-green text-white border-green' : 'bg-bg border-border text-sub')}>{label}</button>
  );
  const list = items.filter((u) => !excludeIds.has(u.id));

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {chip('全員', gender === '', () => setGender(''))}
        {chip('👨 男性', gender === 'male', () => setGender('male'))}
        {chip('👩 女性', gender === 'female', () => setGender('female'))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 名前で検索" className="w-full px-3 py-2 mb-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
      {loading && <div className="text-center text-[11px] text-muted py-3">検索中...</div>}
      {!loading && note && <div className="text-center text-[12px] text-muted py-6">{note}</div>}
      {!loading && !note && list.length === 0 && <div className="text-center text-[12px] text-muted py-6">条件に合うユーザーがいません</div>}
      {list.map((u) => (
        <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
          <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
            <Avatar user={{ id: u.id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl, color: '#2A8C82' } as any} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
              <div className="text-[10px] text-sub truncate">
                {[u.gender === 'male' ? '👨男性' : u.gender === 'female' ? '👩女性' : '', u.age ? `${u.age}歳` : '', u.area].filter(Boolean).join(' ・ ')}
              </div>
            </div>
          </Link>
          <button disabled={busy} onClick={() => onPick(u.id, u.displayName)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0 disabled:opacity-50">この人にする</button>
        </div>
      ))}
    </div>
  );
}

function describeUser(u: import('@/lib/types').User): string {
  // Compact "性別 ・ 年齢 ・ 車の有無" line shown next to a participant's name.
  const parts: string[] = [];
  if (u.gender === 'male') parts.push('👨 男性');
  else if (u.gender === 'female') parts.push('👩 女性');
  if (typeof u.age === 'number' && u.age > 0) parts.push(`${u.age}歳`);
  const car = carLabel(u.car);
  if (car) parts.push(car);
  return parts.join(' ・ ') || '未設定';
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg rounded-[10px] p-3">
      <div className="text-[10px] text-muted mb-1">{label}</div>
      <div className="text-sm font-bold">{children}</div>
    </div>
  );
}

function ConfirmCourseModal({ roundId, initialPrice, onClose }: { roundId: string; initialPrice?: string; onClose: () => void }) {
  const [courseName, setCourseName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('8:00');
  const [price, setPrice] = useState(initialPrice || '');
  const [busy, setBusy] = useState(false);
  const timeSlots: string[] = [];
  for (let h = 6; h <= 23; h++) for (let m = 0; m < 60; m += 5) timeSlots.push(`${h}:${String(m).padStart(2, '0')}`);
  timeSlots.push('24:00'); // ナイター対応（深夜0時まで選択可）

  async function submit() {
    if (!courseName || !date || !startTime) {
      toast('コース名・プレー日・スタート時間は必須です', 'error');
      return;
    }
    setBusy(true);
    try {
      await store.confirmCourse(roundId, { courseName, date, startTime, price: price || undefined });
      toast('コースを確定しました');
      onClose();
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[150] flex items-center justify-center p-5 backdrop-blur-sm">
      <div className="bg-card rounded-card p-5 w-full max-w-[350px] shadow-lg">
        <div className="text-lg font-black mb-1">コース確定</div>
        <div className="text-[12px] text-sub mb-4">予約済みのコース・日時を入力すると、コース確定の募集に変わります</div>

        <Field label="ゴルフ場名" required>
          <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="例: 湘南カントリークラブ" className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>
        <Field label="プレー日" required>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>
        <Field label="スタート時間" required>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none">
            {timeSlots.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="プレー費目安（任意）">
          <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例: ¥8,000〜" className="w-full p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none" />
        </Field>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold">キャンセル</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-3 bg-blue text-white rounded-xl text-sm font-bold disabled:opacity-50">{busy ? '保存中...' : '確定する'}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[11px] font-bold text-sub mb-1">
        {label} {required && <span className="text-red">*</span>}
      </label>
      {children}
    </div>
  );
}

// 参加者ごとのピックアップ状態ラベル（参加確定一覧に表示）。
function pickupStatusLabel(entry?: { stations?: string[]; status?: PickupStatus }): string {
  const st: PickupStatus | undefined = entry?.status || (entry?.stations?.length ? 'can' : undefined);
  return st === 'can' ? '🚗 ピックアップできます'
    : st === 'want' ? '🙋 ピックアップ希望'
    : st === 'cannot' ? '🚶 一人で行きます'
    : st === 'no_need' ? '— ピックアップ不要'
    : '⚪ ピックアップ未回答';
}

// 🚗 ピックアップ（送迎）情報。主催者(round.pickupStations)＋各参加者の回答
// (round.participantPickups[uid]) をまとめて表示。承認済み参加者は自分の回答
// （送迎できる/しない・してほしい/不要＋駅）をその場で登録・更新できる。普段は
// アコーディオンで閉じており、未回答の間はタブ直上に赤いフロートで入力を促す。
function PickupInfo({ round, meId, users, isHost, isApproved }: { round: Round; meId: string; users: User[]; isHost: boolean; isApproved: boolean }) {
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) =>
    users.find((u) => u.id === id)?.displayName
    || (round.guests || []).find((g) => g.id === id)?.name
    || 'メンバー';

  // 送迎できる人 / 希望している人 / 不要・不可 の3グループに集約（読み取り専用）。
  const providers: { id: string; name: string; stations: string[]; capacity?: number; host: boolean }[] = [];
  if ((round.pickupStations?.length ?? 0) > 0) {
    providers.push({ id: round.hostId, name: nameOf(round.hostId), stations: round.pickupStations!, capacity: round.pickupCapacity, host: true });
  }
  const seekers: { id: string; name: string; stations: string[] }[] = [];
  const others: { id: string; name: string; label: string }[] = [];
  Object.entries(round.participantPickups || {}).forEach(([uid, v]) => {
    const st: PickupStatus | undefined = v?.status || (v?.stations?.length ? 'can' : undefined);
    const sts = v?.stations || [];
    const name = nameOf(uid);
    if (st === 'can' && sts.length) providers.push({ id: uid, name, stations: sts, capacity: v?.capacity, host: false });
    else if (st === 'want') seekers.push({ id: uid, name, stations: sts });
    else if (st === 'cannot') others.push({ id: uid, name, label: '🚶 一人で行く' });
    else if (st === 'no_need') others.push({ id: uid, name, label: '— 送迎不要' });
  });

  const hasAny = providers.length > 0 || seekers.length > 0 || others.length > 0;
  if (!hasAny) return null;

  const summary = [
    providers.length ? `送迎できる ${providers.length}` : '',
    seekers.length ? `希望 ${seekers.length}` : '',
    others.length ? `送迎なし ${others.length}` : '',
  ].filter(Boolean).join(' ・ ');

  return (
    <div className="mb-4">
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="bg-green-light rounded-xl border-[1.5px] border-green overflow-hidden">
        <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none">
          <span className="text-[13px] font-black text-white bg-green px-2 py-0.5 rounded-full">ピックアップ</span>
          <span className="text-[11px] font-bold text-green flex-1">{summary || '送迎の状況'}</span>
          <span className="text-green transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
        </summary>

        <div className="px-3 pb-3">
          <div className="text-[10px] text-muted mb-2">回答は下の「参加確定」一覧の各メンバーの「🚗 ピックアップについて」から入力できます。</div>

          {providers.length > 0 && (
            <div className="flex flex-col gap-2 mb-2">
              <div className="text-[11px] font-black text-green">🚗 送迎できる人</div>
              {providers.map((p) => (
                <div key={p.id + (p.host ? '_h' : '')} className="bg-white rounded-lg p-2">
                  <div className="text-[12px] font-bold text-text mb-1">
                    {p.name}
                    {p.host && <span className="ml-1 text-[10px] text-green font-black">主催者</span>}
                    {p.capacity ? <span className="ml-1.5 text-[10px] text-sub font-bold">自分含め{p.capacity}名</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.stations.map((st) => (
                      <span key={st} className="px-2 py-0.5 bg-green-light text-green rounded-full text-[11px] font-bold border border-green">{st}駅</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {seekers.length > 0 && (
            <div className="flex flex-col gap-2 mb-2">
              <div className="text-[11px] font-black text-orange">🙋 ピックアップを希望している人</div>
              {seekers.map((p) => (
                <div key={p.id} className="bg-white rounded-lg p-2">
                  <div className="text-[12px] font-bold text-text mb-1">{p.name}</div>
                  {p.stations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.stations.map((st) => (
                        <span key={st} className="px-2 py-0.5 bg-orange-light text-orange rounded-full text-[11px] font-bold border border-orange">{st}駅</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {others.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-black text-sub">🙅 送迎なし（一人で行く・不要）</div>
              <div className="bg-white rounded-lg p-2 flex flex-wrap gap-x-3 gap-y-1">
                {others.map((o) => (
                  <span key={o.id} className="text-[12px] font-bold text-text">{o.name} <span className="text-[10px] text-muted font-normal">{o.label}</span></span>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

// ピックアップ回答（送迎できる/しない・希望/不要＋駅・定員）の入力フォーム。
// 常に userId=member.id で送信。入力できるのは主催者か本人のみ（サーバ側でも判定）。
// 参加申込時のピックアップ回答モーダル。回答を親に返し、親が join API に同梱する
// （申込直後は承認前でメンバー扱いされず /pickup を単独で叩けないため）。
function PickupJoinModal({ me, onClose, onSubmit }: {
  me: User | undefined;
  onClose: () => void;
  onSubmit: (p: { status?: PickupStatus; stations?: string[]; capacity?: number }) => Promise<void> | void;
}) {
  const carKnown = me?.car === 'have' || me?.car === 'none';
  const role: 'provider' | 'seeker' = me?.car === 'have' ? 'provider' : 'seeker';
  const [status, setStatus] = useState<PickupStatus | undefined>(undefined);
  const [stations, setStations] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const needsStations = status === 'can' || status === 'want';

  async function submit() {
    if (!status || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        status,
        stations: needsStations ? stations : [],
        capacity: status === 'can' ? (capacity || undefined) : undefined,
      });
    } finally { setBusy(false); }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[150] flex items-center justify-center p-5 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-card p-5 w-full max-w-[360px] shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-black mb-1">🚗 ピックアップ（送迎）について</div>
        <div className="text-[12px] text-sub mb-3 leading-relaxed">このゴルフ場への行き方を教えてください。回答は参加申請と一緒に主催者へ伝わります。</div>
        {carKnown ? (
          <div className="flex gap-1.5 mb-2">
            {role === 'provider' ? (
              <>
                <SegBtn active={status === 'can'} onClick={() => setStatus('can')}>🚗 ピックアップできます</SegBtn>
                <SegBtn active={status === 'cannot'} onClick={() => setStatus('cannot')}>🚶 一人で行きます</SegBtn>
              </>
            ) : (
              <>
                <SegBtn active={status === 'want'} onClick={() => setStatus('want')}>🙋 してほしい</SegBtn>
                <SegBtn active={status === 'no_need'} onClick={() => setStatus('no_need')}>不要</SegBtn>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            <SegBtn active={status === 'can'} onClick={() => setStatus('can')}>🚗 ピックアップできます</SegBtn>
            <SegBtn active={status === 'want'} onClick={() => setStatus('want')}>🙋 してほしい</SegBtn>
            <SegBtn active={status === 'cannot'} onClick={() => setStatus('cannot')}>🚶 一人で行きます</SegBtn>
            <SegBtn active={status === 'no_need'} onClick={() => setStatus('no_need')}>不要</SegBtn>
          </div>
        )}
        {needsStations && (
          <div className="bg-bg rounded-lg p-2 mb-2">
            <div className="text-[11px] font-bold text-sub mb-1">{status === 'can' ? '送迎できる駅' : '希望する駅'}</div>
            <PickupStationPicker value={stations} onChange={setStations} />
            {status === 'can' && stations.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-bold text-sub">自分含め乗れる人数</span>
                <NumberInput
                  min={1} max={8}
                  value={capacity || null}
                  onChange={(v) => setCapacity(v ?? 0)}
                  placeholder="例: 4"
                  ariaLabel="自分含め乗れる人数"
                  className="w-14 px-2 py-1 border-[1.5px] border-border rounded-[8px] text-sm bg-card outline-none text-center"
                />
                <span className="text-[11px] text-sub">名</span>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold">やめる</button>
          <button onClick={submit} disabled={busy || !status} className="flex-[2] py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {busy ? '送信中…' : 'この内容で参加を申請する'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PickupStatusEditor({ roundId, member, entry, guest, selfEdit }: {
  roundId: string;
  member: { id: string; displayName: string; car?: string };
  entry?: { stations: string[]; capacity?: number; status?: PickupStatus };
  guest?: boolean;
  selfEdit?: boolean;
}) {
  // 車の有無が分かるなら役割で2択。ゲスト等で不明なら4状態すべて出す。
  const carKnown = member.car === 'have' || member.car === 'none';
  const role: 'provider' | 'seeker' = member.car === 'have' ? 'provider' : 'seeker';
  const initStatus: PickupStatus | undefined = entry?.status || (entry?.stations?.length ? 'can' : undefined);
  const [status, setStatus] = useState<PickupStatus | undefined>(initStatus);
  const [stations, setStations] = useState<string[]>(entry?.stations || []);
  const [capacity, setCapacity] = useState<number>(entry?.capacity || 0);
  const [saving, setSaving] = useState(false);
  const needsStations = status === 'can' || status === 'want';

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/pickup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, status, stations: needsStations ? stations : [], capacity: status === 'can' ? (capacity || undefined) : undefined }),
        cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      store.refreshRounds().catch(() => {});
      toast(selfEdit ? 'ピックアップの回答を保存しました🚗' : `${member.displayName}さんのピックアップを保存しました🚗`);
    } catch { toast('保存に失敗しました', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {carKnown ? (
        <div className="flex gap-1.5 mb-1.5">
          {role === 'provider' ? (
            <>
              <SegBtn active={status === 'can'} onClick={() => setStatus('can')}>🚗 ピックアップできます</SegBtn>
              <SegBtn active={status === 'cannot'} onClick={() => setStatus('cannot')}>🚶 一人で行きます</SegBtn>
            </>
          ) : (
            <>
              <SegBtn active={status === 'want'} onClick={() => setStatus('want')}>🙋 してほしい</SegBtn>
              <SegBtn active={status === 'no_need'} onClick={() => setStatus('no_need')}>不要</SegBtn>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
          <SegBtn active={status === 'can'} onClick={() => setStatus('can')}>🚗 ピックアップできます</SegBtn>
          <SegBtn active={status === 'want'} onClick={() => setStatus('want')}>🙋 してほしい</SegBtn>
          <SegBtn active={status === 'cannot'} onClick={() => setStatus('cannot')}>🚶 一人で行きます</SegBtn>
          <SegBtn active={status === 'no_need'} onClick={() => setStatus('no_need')}>不要</SegBtn>
        </div>
      )}
      {needsStations && (
        <div className="bg-bg rounded-lg p-2 mb-1.5">
          <PickupStationPicker value={stations} onChange={setStations} />
          {status === 'can' && stations.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] font-bold text-sub">自分含め乗れる人数</span>
              <input
                type="number" min={1} max={8} inputMode="numeric"
                value={capacity || ''}
                onChange={(e) => setCapacity(Math.max(0, Math.min(8, Number(e.target.value) || 0)))}
                placeholder="例: 4"
                className="w-14 px-2 py-1 border-[1.5px] border-border rounded-[8px] text-sm bg-card outline-none text-center"
              />
              <span className="text-[11px] text-sub">名</span>
            </div>
          )}
        </div>
      )}
      <button onClick={save} disabled={saving || !status} className="w-full py-2 bg-green text-white rounded-full text-[12px] font-bold disabled:opacity-50">
        {saving ? '保存中…' : '保存する'}
      </button>
    </div>
  );
}

// 参加確定メンバー各行の「ピックアップについて」ボタン＋インライン開閉エディタ。
// 入力できるのは主催者か本人のみ（このボタン自体が主催者/本人にしか表示されない）。
function PickupMemberControl({ round, member, meId, isHost, guest }: {
  round: Round;
  member: { id: string; displayName: string; car?: string };
  meId: string; isHost: boolean; guest?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const entry = round.participantPickups?.[member.id];
  const isSelf = member.id === meId;
  const isSeeker = entry?.status === 'want';
  const proposal = round.pickupProposals?.[member.id] || null;
  // 自分宛ての提案（希望者のみ）。
  const showProposal = isSelf && isSeeker && !!proposal;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border-[1.5px] text-[12px] font-bold ${open ? 'border-green bg-green-light text-green' : 'border-border bg-card text-sub'}`}
      >
        🚗 ピックアップについて
        {showProposal && <span className="text-[10px] font-black px-1.5 py-[1px] rounded-full bg-orange text-white">🚉 提案あり</span>}
        <span className="ml-auto">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-1.5 bg-white rounded-lg border border-green/30 p-2.5">
          {showProposal && (
            <PickupProposalBanner roundId={round.id} station={proposal!.station} />
          )}

          <PickupStatusEditor roundId={round.id} member={member} entry={entry} guest={guest} selfEdit={isSelf} />

          {/* 主催者：希望者にピックアップ場所を提案（登録メンバーのみ） */}
          {isHost && isSeeker && !guest && (
            <div className="mt-2 pt-2 border-t border-green/20">
              <HostProposeRow roundId={round.id} member={member} proposal={proposal} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 受け手：主催者からのピックアップ場所提案に「OK」か「相談したい」で応答する。
function PickupProposalBanner({ roundId, station }: { roundId: string; station: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'accept' | 'discuss' | null>(null);

  async function respond(action: 'accept' | 'discuss') {
    setBusy(action);
    try {
      const res = await fetch(`/api/rounds/${roundId}/pickup-proposal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (action === 'accept') {
        await store.refreshRounds().catch(() => {});
        toast(`${station}駅 を承諾しました（あなたの希望駅に追加）🚉`);
      } else {
        toast('相談スレッドを作成しました💬');
        router.push(`/round/${roundId}/chat${d.threadId ? `?thread=${encodeURIComponent(d.threadId)}` : ''}`);
      }
    } catch { toast('処理に失敗しました', 'error'); }
    finally { setBusy(null); }
  }

  return (
    <div className="mb-3 bg-white rounded-xl border-2 border-orange p-3">
      <div className="text-[11px] font-black text-orange mb-0.5">🚉 主催者からのピックアップ提案</div>
      <div className="text-[13px] font-bold text-text mb-2">
        「<span className="text-orange">{station}駅</span>」でのピックアップはどうですか？
      </div>
      <div className="flex gap-2">
        <button onClick={() => respond('accept')} disabled={!!busy}
          className="flex-1 py-2.5 bg-green text-white rounded-full text-[13px] font-bold disabled:opacity-50">
          {busy === 'accept' ? '設定中…' : '✅ 承諾する'}
        </button>
        <button onClick={() => respond('discuss')} disabled={!!busy}
          className="flex-1 py-2.5 bg-white text-orange border-[1.5px] border-orange rounded-full text-[13px] font-bold disabled:opacity-50">
          {busy === 'discuss' ? '準備中…' : '💬 相談したい'}
        </button>
      </div>
      <div className="text-[10px] text-muted mt-1.5 leading-relaxed">
        承諾すると、この駅があなたの希望駅に追加されます（スレッドは立ちません）。難しいときだけ「相談したい」を押してください。
      </div>
    </div>
  );
}

// 主催者：参加者ひとりに対してピックアップ場所（駅）を提案する1行。
function HostProposeRow({ roundId, member, proposal }: {
  roundId: string;
  member: { id: string; displayName: string };
  proposal: import('@/lib/types').PickupProposal | null;
}) {
  const [station, setStation] = useState(proposal?.station || '');
  const [busy, setBusy] = useState(false);

  async function propose() {
    const s = station.trim();
    if (!s) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/pickup-proposal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'propose', userId: member.id, station: s }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      await store.refreshRounds().catch(() => {});
      toast(`${member.displayName}さんに ${s}駅 を提案しました🚉`);
    } catch { toast('提案に失敗しました', 'error'); }
    finally { setBusy(false); }
  }

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${roundId}/pickup-proposal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', userId: member.id }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      await store.refreshRounds().catch(() => {});
      toast('提案を取り消しました');
    } catch { toast('取り消しに失敗しました', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-lg p-2">
      <div className="text-[12px] font-bold text-text mb-1.5">
        {member.displayName}
        {proposal && <span className="ml-1.5 text-[10px] font-black text-orange">提案中: {proposal.station}駅</span>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={station}
          onChange={(e) => setStation(e.target.value.slice(0, 20))}
          placeholder="提案する駅名"
          className="flex-1 min-w-0 text-[13px] border-[1.5px] border-border rounded-lg px-2.5 py-1.5 bg-bg outline-none"
        />
        <button onClick={propose} disabled={busy || !station.trim()} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold disabled:opacity-50 flex-shrink-0">提案</button>
        {proposal && (
          <button onClick={cancel} disabled={busy} className="px-3 py-1.5 bg-white text-red border border-red rounded-lg text-xs font-bold disabled:opacity-50 flex-shrink-0">取消</button>
        )}
      </div>
    </div>
  );
}

// ピックアップ回答のトグルボタン（送迎できる/しない・してほしい/不要）。
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={'flex-1 py-2 text-[12px] font-bold rounded-[10px] border-[1.5px] ' + (active ? 'border-green bg-green text-white' : 'border-green/40 bg-white text-green')}
    >{children}</button>
  );
}

