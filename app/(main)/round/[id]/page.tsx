'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { chatIdFor, formatDate, ratingLabel, carLabel } from '@/lib/utils';
import { levelConditionLabel } from '@/lib/roundEligibility';
import { OfficialBadge, OfficialAvatar } from '@/components/OfficialHost';
import { GroupAssignment } from '@/components/GroupAssignment';
import { PickupStationPicker } from '@/components/PickupStationPicker';
import { MatchPicker } from '@/components/MatchPicker';
import type { Round, User } from '@/lib/types';

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
  const storeRound = useStore((s) => s.rounds.find((r) => r.id === params.id));
  const storeUsers = useStore((s) => s.users);
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const profileReady = isProfileComplete(me?.age);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [interestedOpen, setInterestedOpen] = useState(false);
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
  const invitedUsers = (round.invitedIds || [])
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

  async function join() {
    if (requireLogin()) return;
    track('join_round_click', { roundId: round!.id, hostId: round!.hostId });
    // Profile gate: a friend who arrived via a shared link can read the round
    // detail without registering, but joining requires a profile. Bounce them
    // to the edit screen with returnTo so save sends them right back here.
    if (!profileReady) {
      track('join_round_profile_gate', { roundId: round!.id });
      toast('参加にはプロフィール登録が必要です');
      router.push(`/mypage/edit?returnTo=${encodeURIComponent(`/round/${round!.id}`)}`);
      return;
    }
    try {
      await store.joinRound(round!.id);
      track('join_round_success', { roundId: round!.id });
      toast('参加申請を送信しました');
    } catch (e) {
      track('join_round_error', { message: (e as Error).message });
      toast('失敗: ' + (e as Error).message, 'error');
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
  async function leave() {
    if (!confirm('このラウンドから抜けますか？')) return;
    try { await store.leaveRound(round!.id); toast('離脱しました'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function close() {
    if (!confirm('この募集を閉じますか？')) return;
    try { await store.closeRound(round!.id); toast('募集を閉じました'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function complete() {
    if (!confirm('ラウンドを完了しますか？\n参加者全員にレビュー依頼が送られます。')) return;
    try { await store.completeRound(round!.id); toast('ラウンド完了'); router.push('/home'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function approve(userId: string) {
    try { await store.approveApplicant(round!.id, userId); toast('承認しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function reject(userId: string) {
    if (!confirm('この申請を断りますか？')) return;
    try { await store.rejectApplicant(round!.id, userId); toast('却下しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function kick(userId: string, name: string) {
    if (!confirm(`${name}さんをラウンドから外しますか？`)) return;
    try { await store.kickApplicant(round!.id, userId); toast('外しました'); }
    catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }
  async function onToggleInterest() {
    if (requireLogin()) return;
    const next = !(round!.interestedIds || []).includes(meId);
    if (storeRound) {
      try { await store.toggleInterest(round!.id, next); }
      catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
    } else {
      // Round not in store (arrived via shared link) — call API + patch local copy.
      try {
        const res = await fetch(`/api/rounds/${round!.id}/interest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interested: next }), cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        if (j.round) setFetchedRound((prev) => (prev ? { ...prev, ...j.round } : j.round));
      } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
    }
  }
  async function invite(userId: string, name: string) {
    try {
      const updated = await store.inviteToRound(round!.id, userId);
      if (!storeRound && updated) setFetchedRound((prev) => (prev ? { ...prev, ...updated } : prev));
      toast(`${name}さんを招待しました`);
    } catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
        <div className="flex items-center gap-2">
          <button
            onClick={shareRound}
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

      <div className="bg-card rounded-card p-5 shadow-card">
        {isComp && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-orange text-white mb-3">🏆 コンペ・イベント</span>
        )}
        {isFlexible && (
          <span className="inline-block px-2.5 py-[3px] rounded-full text-[11px] font-bold bg-[#EFEFEC] text-sub mb-3 ml-2">📍 コース未定</span>
        )}
        <div className="text-xl font-black mb-4">{round.title}</div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <Cell label="日時">{dateLabel} {round.startTime || ''}</Cell>
          <Cell label={round.type === 'confirmed' ? 'コース' : 'エリア'}>{round.type === 'confirmed' ? round.courseName : round.area}</Cell>
          <Cell label="レベル">{levelConditionLabel(round)}</Cell>
          <Cell label="費用目安">{round.price ? (() => { const p = round.price.replace(/[¥￥]/g, '').trim(); return p.includes('円') ? p : `${p}円`; })() : '—'}</Cell>
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

        {/* 🚗 送迎（主催者＋車ありの参加者） */}
        <PickupInfo round={round} meId={meId} users={users} isHost={isHost} isApproved={isApproved} />

        {round.description && (
          <div className="mb-4 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed">{round.description}</div>
        )}

        {/* ♡「気になる」toggle — anyone but the host. Lets you bookmark a round
            and get a "締切間近" nudge; the host can also invite you from here. */}
        {!isHost && (
          <button
            onClick={onToggleInterest}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-4 text-sm font-bold border-[1.5px] transition-colors ${
              iAmInterested
                ? 'bg-pink-100 text-pink-600 border-pink-300'
                : 'bg-card text-sub border-border'
            }`}
          >
            <span className="text-base">{iAmInterested ? '❤️' : '🤍'}</span>
            {iAmInterested ? '気になるに追加済み' : '気になる'}
            {interestedUsers.length > 0 && (
              <span className="text-[11px] font-bold opacity-80">（{interestedUsers.length}）</span>
            )}
          </button>
        )}

        {/* Group chat entry */}
        {canChatGroup && (
          <Link href={`/round/${round.id}/chat`} className="flex items-center gap-2 p-3 bg-green-light text-green rounded-xl mb-2 font-bold text-sm">
            <span className="text-lg">💬</span>
            <span className="flex-1">ラウンドチャット（参加者全員）</span>
            <span>›</span>
          </Link>
        )}

        {/* LINEオープンチャット — LINEアイコン＋目立つ見出し＋小さな補足。
            URLの設定/編集は投稿者の編集画面（鉛筆）で行う。 */}
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
        {canChatGroup && !round.openChatUrl && <div className="mb-2" />}

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

        {/* Approved applicants */}
        {applicants.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">参加確定（{applicants.length}名）</div>
            {applicants.map((u) => u && (
              <div key={u.id} className="flex items-center gap-2 p-2.5 bg-bg rounded-[10px] mb-1.5">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={u} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                    {isHost && participantNames[u.id] && (
                      <div className="text-[10px] text-green font-bold">📋 {participantNames[u.id]}</div>
                    )}
                    <div className="text-[10px] text-sub">{describeUser(u)} ・ {ratingLabel(u)}</div>
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
                : profileReady
                  ? `参加を申請する（残り${remaining}枠）`
                  : `プロフィール登録して参加する（残り${remaining}枠）`}
            </button>
            <div className="text-[11px] text-muted text-center mt-2">
              {!meId
                ? 'まずは中身を自由に閲覧できます。参加する時だけログインが必要です'
                : profileReady
                  ? '主催者が承認するまでお待ちください'
                  : '次の画面でプロフィールを登録すると、戻ってきて参加申請できます'}
            </div>
          </>
        )}
      </div>

      {/* 組分け・スタート時間 — competition rounds. Host edits (drag & drop),
          participants see it read-only. */}
      {isComp && (isHost || isApproved) && (
        <div className="mt-3">
          <GroupAssignment round={round} users={users as User[]} isHost={isHost} />
        </div>
      )}

      {/* Score entry — visible to any participant once the round is marked
          completed. The host triggers completion via the ラウンド完了 button
          above; after that everyone in the round can fill in / edit scores. */}
      {round.status === 'completed' && (isHost || isApproved) && (
        <ScoreEntryCard
          round={round}
          host={host}
          applicants={applicants as any}
        />
      )}

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

      {inviteOpen && (
        <PickerModal title="ゴルトモを招待する" onClose={() => setInviteOpen(false)}>
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
  for (let h = 6; h <= 14; h++) for (let m = 0; m < 60; m += 5) timeSlots.push(`${h}:${String(m).padStart(2, '0')}`);

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

// 🚗 送迎情報。主催者(round.pickupStations)＋車ありの参加者
// (round.participantPickups[uid]) をまとめて表示。さらに「自分が車あり参加者」
// なら、自分の送迎できる駅をその場で登録・更新できる。
function PickupInfo({ round, meId, users, isHost, isApproved }: { round: Round; meId: string; users: User[]; isHost: boolean; isApproved: boolean }) {
  const meUser = users.find((u) => u.id === meId);
  const canRegister = !isHost && isApproved && meUser?.car === 'have';
  const mine = round.participantPickups?.[meId];
  const [myStations, setMyStations] = useState<string[]>(mine?.stations || []);
  const [myCapacity, setMyCapacity] = useState<number>(mine?.capacity || 0);
  const [saved, setSaved] = useState<{ stations: string[]; capacity: number }>({ stations: mine?.stations || [], capacity: mine?.capacity || 0 });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  // 登録済みの値が（ラウンド取得タイミングの都合で）エディタに反映されない
  // ことがあったため、編集中でない時は最新の登録値へ同期する＝いつでも修正可能に。
  const mineKey = JSON.stringify(mine || null);
  useEffect(() => {
    if (editing) return; // 編集中はユーザー入力を上書きしない
    setMyStations(mine?.stations || []);
    setMyCapacity(mine?.capacity || 0);
    setSaved({ stations: mine?.stations || [], capacity: mine?.capacity || 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineKey, editing]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/pickup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stations: myStations, capacity: myCapacity || undefined }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved({ stations: myStations, capacity: myCapacity });
      setEditing(false);
      store.refreshRounds().catch(() => {});
      toast(myStations.length ? '送迎できる駅を保存しました🚗' : '送迎の登録を解除しました');
    } catch (e) { toast('保存に失敗しました', 'error'); }
    finally { setSaving(false); }
  }

  // 表示用：主催者＋各参加者（自分の最新保存値で上書き）
  const people: { id: string; name: string; stations: string[]; capacity?: number; host: boolean }[] = [];
  if ((round.pickupStations?.length ?? 0) > 0) {
    people.push({ id: round.hostId, name: users.find((u) => u.id === round.hostId)?.displayName || '主催者', stations: round.pickupStations!, capacity: round.pickupCapacity, host: true });
  }
  const pp = { ...(round.participantPickups || {}) };
  if (canRegister) { if (saved.stations.length) pp[meId] = { stations: saved.stations, capacity: saved.capacity || undefined }; else delete pp[meId]; }
  Object.entries(pp).forEach(([uid, v]) => {
    const sts = v?.stations || [];
    if (sts.length) people.push({ id: uid, name: users.find((u) => u.id === uid)?.displayName || 'メンバー', stations: sts, capacity: v?.capacity, host: false });
  });

  if (people.length === 0 && !canRegister) return null;

  return (
    <div className="mb-4 p-3 bg-green-light rounded-xl border-[1.5px] border-green">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-black text-white bg-green px-2 py-0.5 rounded-full">ピックアップ場所</span>
        <span className="text-[12px] font-bold text-green">送迎できる人</span>
      </div>
      {people.length > 0 ? (
        <div className="flex flex-col gap-2">
          {people.map((p) => (
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
      ) : (
        <div className="text-[11px] text-green font-semibold">まだ送迎できる人がいません。車をお持ちなら下から登録できます。</div>
      )}

      {canRegister && (
        <div className="mt-3 pt-3 border-t border-green/40">
          <div className="text-[11px] font-black text-green mb-1.5">🚗 あなたが送迎できる駅（車あり）</div>
          <div className="bg-white rounded-lg p-2">
            <PickupStationPicker value={myStations} onChange={(v) => { setEditing(true); setMyStations(v); }} />
            {myStations.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-bold text-sub">自分含め乗れる人数</span>
                <input
                  type="number" min={1} max={8} inputMode="numeric"
                  value={myCapacity || ''}
                  onChange={(e) => { setEditing(true); setMyCapacity(Math.max(0, Math.min(8, Number(e.target.value) || 0))); }}
                  placeholder="例: 4"
                  className="w-14 px-2 py-1 border-[1.5px] border-border rounded-[8px] text-sm bg-bg outline-none text-center"
                />
                <span className="text-[11px] text-sub">名</span>
              </div>
            )}
          </div>
          <button onClick={save} disabled={saving} className="mt-2 w-full py-2.5 bg-green text-white rounded-full text-[13px] font-bold disabled:opacity-50">
            {saving ? '保存中…' : (saved.stations.length ? '送迎できる駅を更新する' : '送迎できる駅を登録する')}
          </button>
          <div className="text-[10px] text-green/80 text-center mt-1">登録後もいつでも変更・解除できます</div>
        </div>
      )}
    </div>
  );
}

