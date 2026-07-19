'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { chatIdFor, formatDate, ratingLabel, carLabel, priceLabelForGender, isSplitPrice } from '@/lib/utils';
import { levelConditionLabel } from '@/lib/roundEligibility';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { GroupAssignment } from '@/components/GroupAssignment';
import { CarDispatch } from '@/components/CarDispatch';
import { PickupStationPicker } from '@/components/PickupStationPicker';
import { RESTRICTION_MSG } from '@/lib/restrictions';
import { readApiError } from '@/lib/apiError';
import { MatchPicker } from '@/components/MatchPicker';
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
  const [inviteMessage, setInviteMessage] = useState('');
  const [interestedOpen, setInterestedOpen] = useState(false);
  // 詳細のセクション切り替えタブ（参加してる人／ピックアップ／組み分け）。
  const [tab, setTab] = useState<'people' | 'pickup' | 'groups'>('people');
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
    if (!params.id || !r || r.hostId !== meId) { setParticipantNames({}); return; }
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
    const participating = r.hostId === meId || r.applicantIds.includes(meId) || (r.pendingApplicantIds || []).includes(meId);
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
  const applicants = round.applicantIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const pendingApplicants = (round.pendingApplicantIds || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const isHost = round.hostId === meId;
  const isApproved = round.applicantIds.includes(meId);
  const isPending = (round.pendingApplicantIds || []).includes(meId);
  const isFull = round.currentCount >= round.maxSpots;
  const remaining = round.maxSpots - round.currentCount;
  const isComp = round.maxSpots >= 5;
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
    // 準備OK → ピックアップ回答モーダルへ（回答と一緒に申込む）。
    setPickupOpen(true);
  }

  // ピックアップ回答を添えて参加申込を確定する。
  async function submitJoin(pickup: { status?: PickupStatus; stations?: string[]; capacity?: number }) {
    try {
      await store.joinRound(round!.id, pickup);
      track('join_round_success', { roundId: round!.id });
      setPickupOpen(false);
      toast('参加申請を送信しました');
    } catch (e) {
      track('join_round_error', { message: (e as Error).message });
      toast((e as Error).message, 'error');
    }
  }
  async function shareRound() {
    // Direct public URL — opens & is viewable instantly, no LINE login required.
    // Login is only requested when the visitor takes an action (apply, etc.).
    const url = `https://app.goltomo.com/round/${round!.id}`;
    const text = `⛳ ${round!.title}\n${dateLabel}${round!.startTime ? ' ' + round!.startTime : ''}`;
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
    const place = r.type === 'confirmed'
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
      `⛳ ${r.title}`,
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
  async function complete() {
    if (!(await confirmDialog('ラウンドを完了しますか？\n参加者全員にレビュー依頼が送られます。'))) return;
    try { await store.completeRound(round!.id); toast('ラウンド完了'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function approve(userId: string) {
    try { await store.approveApplicant(round!.id, userId); toast('承認しました'); }
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
  async function invite(userId: string, name: string) {
    if (restrictions.noInvite) { toast(RESTRICTION_MSG.noInvite, 'error'); return; }
    try {
      const updated = await store.inviteToRound(round!.id, userId, inviteMessage.trim() || undefined);
      if (!storeRound && updated) setFetchedRound((prev) => (prev ? { ...prev, ...updated } : prev));
      toast(`${name}さんを招待しました`);
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
        {isComp && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white mb-3">🏆 コンペ・イベント</span>
        )}
        {isFlexible && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-[#EFEFEC] text-sub mb-3 ml-2">📍 コース未定</span>
        )}
        <div className="text-xl font-black mb-4">{round.title}</div>

        {/* 自由記入のコメント（投稿の一番上に表示） */}
        {round.description && (
          <div className="mb-4 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed whitespace-pre-wrap">{round.description}</div>
        )}

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <Cell label="日時">{dateLabel} {round.startTime || ''}</Cell>
          <Cell label={round.type === 'confirmed' ? 'コース' : 'エリア'}>{round.type === 'confirmed' ? round.courseName : round.area}</Cell>
          <Cell label="レベル">{levelConditionLabel(round)}</Cell>
          <Cell label="費用目安">{priceLabelForGender(round, me?.gender) || '—'}{isSplitPrice(round) && me?.gender ? <span className="ml-1 text-[9px] text-muted font-bold">（{me.gender === 'female' ? '女性' : '男性'}）</span> : null}</Cell>
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
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-light text-blue">👨 男 {m}</span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-pink-100 text-pink-600">👩 女 {f}</span>
                {o > 0 && (
                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-bg text-sub">未設定 {o}</span>
                )}
              </div>
              {(exM + exF) > 0 && (
                <div className="mt-1.5 text-[10px] font-bold text-sub">
                  うち主催者の知り合い：👨{exM} ・ 👩{exF}
                </div>
              )}
            </div>
          );
        })()}

        {/* 募集の性別内訳（ターゲット）。男女いずれかを指定している募集のみ表示。 */}
        {((round.spotsMale || 0) + (round.spotsFemale || 0)) > 0 && (
          <div className="mb-4 px-3 py-2.5 bg-bg rounded-xl">
            <div className="text-[11px] font-bold text-sub mb-1.5">募集の内訳（あなた以外 {round.maxSpots - 1}枠）</div>
            <div className="flex flex-wrap gap-1.5">
              {(round.spotsMale || 0) > 0 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-light text-blue">👨 男性 {round.spotsMale}名</span>}
              {(round.spotsFemale || 0) > 0 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-pink-100 text-pink-600">👩 女性 {round.spotsFemale}名</span>}
              {(round.spotsAny || 0) > 0 && <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-green-light text-green">🙆 どちらでも {round.spotsAny}名</span>}
            </div>
          </div>
        )}

        {/* 参加状況バーはコンペ以外の通常募集でも表示（何人中何人参加か） */}
        <div className="mb-4">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-xs font-semibold text-sub">参加状況</span>
            <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
          </div>
          <div className="w-full h-2 bg-bg rounded overflow-hidden">
            <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / Math.max(1, round.maxSpots)) * 100)}%` }} />
          </div>
        </div>

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

        {/* セクション切り替えタブ（参加してる人／ピックアップ／組み分け） */}
        <div className="flex gap-1 mb-4 bg-bg rounded-xl p-1">
          {([['people', '参加してる人'], ['pickup', 'ピックアップ'], ['groups', '組み分け']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={'flex-1 py-2 rounded-lg text-[12px] font-bold ' + (tab === k ? 'bg-card text-green shadow-sm' : 'text-sub')}
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
            <div className="text-[11px] text-muted mt-1">※ 各メンバーの送迎回答は「参加してる人」タブの各行から確認・編集できます。</div>
          </>
        )}

        {/* ── 参加してる人 タブ（開始） ── */}
        {tab === 'people' && (
          <>
        {/* Host — official rounds show the branded ゴルトモ公式 identity instead
            of the admin's personal profile. */}
        {round.isOfficial ? (
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
        ) : host ? (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">主催者</div>
            <div className="flex items-center gap-2.5 p-3 bg-bg rounded-xl">
              <Link href={`/profile/${host.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                <Avatar user={host} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{host.displayName}</div>
                  <div className="text-[11px] text-sub truncate">{describeUser(host)} ・ {ratingLabel(host, { count: true })}{host.scoreRange ? ' ・ ' + host.scoreRange : ''}</div>
                </div>
              </Link>
              {!isHost && (
                <Link
                  href={`/chat/${chatIdFor(meId, host.id)}?other=${host.id}`}
                  className="px-3 py-1.5 bg-blue text-white rounded-lg text-xs font-bold flex-shrink-0"
                >
                  💬 メッセージ
                </Link>
              )}
            </div>
          </div>
        ) : null}

        {/* Approved applicants + ゲスト。レビュー/初参加の代わりにピックアップ状態を表示。 */}
        {(applicants.length > 0 || (round.guests?.length ?? 0) > 0) && (
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
                  {!isHost && u.id !== meId && (
                    <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                  )}
                  {isHost && (
                    <>
                      <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                      <button onClick={() => kick(u.id, u.displayName)} className="px-2.5 py-1 bg-card text-red border border-red rounded text-[11px] font-bold flex-shrink-0">外す</button>
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
                </div>
                {isHost && round.status !== 'completed' && (
                  <PickupMemberControl round={round} member={{ id: g.id, displayName: g.name }} meId={meId} isHost={isHost} guest />
                )}
              </div>
            ))}
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
                    <div className="text-[10px] text-sub">{describeUser(u)} ・ {ratingLabel(u, { count: true })}</div>
                  </div>
                </Link>
                <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                <button onClick={() => approve(u.id)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">承認</button>
                <button onClick={() => reject(u.id)} className="px-2.5 py-1 bg-card text-sub border border-border rounded-lg text-xs font-bold flex-shrink-0">却下</button>
              </div>
            ))}
          </div>
        )}

        {/* Invited users (everyone can see who's been invited) */}
        {invitedUsers.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">💌 招待中（{invitedUsers.length}名）</div>
            {invitedUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={u} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                    <div className="text-[10px] text-sub">{describeUser(u)} ・ {ratingLabel(u)}</div>
                  </div>
                </Link>
                <span className="text-[10px] text-sub font-bold flex-shrink-0">招待済み</span>
              </div>
            ))}
          </div>
        )}

        {/* Host: open the ゴルトモ invite picker */}
        {isHost && round.status === 'open' && (
          <button
            onClick={() => setInviteOpen(true)}
            className="w-full py-3 bg-green text-white rounded-xl mb-3 text-sm font-bold flex items-center justify-center gap-2"
          >
            <span>💌</span> ゴルトモを招待する
          </button>
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
          </>
        )}

        {/* ── 組み分け タブ ── */}
        {tab === 'groups' && (
          <>
            {isComp && (isHost || isApproved) ? (
              <GroupAssignment round={round} users={users as User[]} isHost={isHost} />
            ) : (
              <div className="text-center text-sub text-sm py-8 leading-relaxed">
                組み分け（スタート時間・コース）は、<br />5人以上のコンペ・イベントで<br />主催者・参加者が使えます。
              </div>
            )}
          </>
        )}

        {/* Action buttons */}
        {isHost ? (
          <div className="space-y-2 mt-4">
            {isFlexible && round.status === 'open' && (
              <button onClick={() => setConfirmOpen(true)} className="w-full py-4 bg-blue text-white rounded-xl text-[15px] font-bold">
                📅 コース確定にする
              </button>
            )}
            {(round.type === 'confirmed' || round.status !== 'open') && (
              <button onClick={complete} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold">
                ラウンド完了
              </button>
            )}
            <button onClick={close} className="w-full py-3 bg-bg text-sub rounded-xl text-sm font-bold">募集を閉じる</button>
          </div>
        ) : isApproved ? (
          <div className="space-y-2 mt-2">
            <div className="text-center py-3 bg-green-light text-green rounded-xl text-sm font-bold">✅ 参加確定</div>
            <button onClick={leave} className="w-full py-3 bg-card text-red border border-red rounded-xl text-sm font-bold">参加を取りやめる</button>
          </div>
        ) : isPending ? (
          <div className="space-y-2 mt-2">
            <div className="text-center py-3 bg-yellow-light text-orange rounded-xl text-sm font-bold">⏳ 承認待ち</div>
            <button onClick={leave} className="w-full py-3 bg-card text-sub border border-border rounded-xl text-sm font-bold">申請を取り下げる</button>
          </div>
        ) : isFull ? (
          <div className="text-center py-3 bg-bg text-muted rounded-xl text-sm font-bold mt-2">満員のため受付終了</div>
        ) : (
          <>
            <button onClick={join} className="w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold mt-2">
              {!meId
                ? `LINEログインして参加する（残り${remaining}枠）`
                : joinReady
                  ? `参加を申請する（残り${remaining}枠）`
                  : !profileReady
                    ? `プロフィール登録して参加する（残り${remaining}枠）`
                    : `お名前を登録して参加する（残り${remaining}枠）`}
            </button>
            <div className="text-[11px] text-muted text-center mt-2">
              {!meId
                ? 'まずは中身を自由に閲覧できます。参加する時だけログインが必要です'
                : joinReady
                  ? '参加申請の前に、送迎（ピックアップ）についてうかがいます'
                  : !profileReady
                    ? '次の画面でプロフィールを登録すると、戻ってきて参加申請できます'
                    : 'ゴルフ場への届出用に、お名前（漢字フルネーム）の登録が必要です'}
            </div>
          </>
        )}
      </div>

      {round.status === 'completed' && (isHost || isApproved) && (
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
          <div className="mb-3">
            <label className="block text-[11px] font-bold text-sub mb-1">一言メッセージ（任意・招待通知に添えられます）</label>
            <textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value.slice(0, 200))}
              placeholder="例: 久しぶりに一緒に回りませんか？🏌️"
              className="w-full h-16 p-2.5 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
            />
            <div className="text-[10px] text-muted text-right mt-0.5">{inviteMessage.length}/200</div>
          </div>
          <InviteSearch inviteState={inviteState} onInvite={invite} />
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
                      <div className="text-[10px] text-sub">{describeUser(u)} ・ {ratingLabel(u)}</div>
                    </div>
                  </Link>
                  {/* Host can invite interested people straight from this list. */}
                  {isHost && (
                    st === 'joined' ? (
                      <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">参加済み</span>
                    ) : st === 'invited' ? (
                      <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">招待済み</span>
                    ) : (
                      <button onClick={() => invite(u.id, u.displayName)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">招待</button>
                    )
                  )}
                </div>
              );
            })
          )}
        </PickerModal>
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
                const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
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
function InviteSearch({ inviteState, onInvite }: { inviteState: (id: string) => 'joined' | 'invited' | 'open'; onInvite: (id: string, name: string) => void }) {
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
        <input value={minAge} onChange={(e) => setMinAge(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="最小" className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center" />
        <span className="text-xs text-sub">〜</span>
        <input value={maxAge} onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="最大" className="w-16 px-2 py-1.5 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center" />
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
              <span className="px-3 py-1.5 bg-bg text-muted border border-border rounded-lg text-xs font-bold flex-shrink-0">招待済み</span>
            ) : (
              <button onClick={() => onInvite(u.id, u.displayName)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">招待</button>
            )}
          </div>
        );
      })}
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

