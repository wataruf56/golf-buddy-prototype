'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';
import { Avatar } from '@/components/Avatar';
import { track } from '@/lib/telemetry';
import { chatIdFor, formatDate } from '@/lib/utils';
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

  async function join() {
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
    const url = `${SHARE_BASE}?to=${encodeURIComponent(`/round/${round!.id}`)}`;
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

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
        <button
          onClick={shareRound}
          className="px-3 py-1.5 bg-bg border-[1.5px] border-border rounded-full text-xs font-bold flex items-center gap-1"
          aria-label="この募集を友達にシェア"
        >
          <span>🔗</span>
          <span>シェア</span>
        </button>
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
          <Cell label="レベル">{round.levelCondition}</Cell>
          <Cell label="費用目安">{round.price || '—'}</Cell>
        </div>

        {isComp && (
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs font-semibold text-sub">参加状況</span>
              <span className="text-sm font-black text-orange">{round.currentCount}/{round.maxSpots}人 参加中</span>
            </div>
            <div className="w-full h-2 bg-bg rounded overflow-hidden">
              <div className="h-full bg-orange rounded" style={{ width: `${Math.round((round.currentCount / round.maxSpots) * 100)}%` }} />
            </div>
          </div>
        )}

        {round.description && (
          <div className="mb-4 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed">{round.description}</div>
        )}

        {/* Group chat entry */}
        {canChatGroup && (
          <Link href={`/round/${round.id}/chat`} className="flex items-center gap-2 p-3 bg-green-light text-green rounded-xl mb-4 font-bold text-sm">
            <span className="text-lg">💬</span>
            <span className="flex-1">ラウンドチャット（参加者全員）</span>
            <span>›</span>
          </Link>
        )}

        {/* Host */}
        {host && (
          <div className="mb-4">
            <div className="text-[13px] font-bold mb-2">主催者</div>
            <div className="flex items-center gap-2.5 p-3 bg-bg rounded-xl">
              <Link href={`/profile/${host.id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                <Avatar user={host} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{host.displayName}</div>
                  <div className="text-[11px] text-sub truncate">★{host.reviewAvg}（{host.reviewCount}件）{host.scoreRange ? ' ・ ' + host.scoreRange : ''}</div>
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
        )}

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
                    <div className="text-[10px] text-sub">★{u.reviewAvg}</div>
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
                    <div className="text-[10px] text-sub">★{u.reviewAvg}（{u.reviewCount}件）</div>
                  </div>
                </Link>
                <Link href={`/chat/${chatIdFor(meId, u.id)}?other=${u.id}`} className="px-2.5 py-1 bg-blue text-white rounded text-[11px] font-bold flex-shrink-0">💬</Link>
                <button onClick={() => approve(u.id)} className="px-3 py-1.5 bg-green text-white rounded-lg text-xs font-bold flex-shrink-0">承認</button>
                <button onClick={() => reject(u.id)} className="px-2.5 py-1 bg-card text-sub border border-border rounded-lg text-xs font-bold flex-shrink-0">却下</button>
              </div>
            ))}
          </div>
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
              {profileReady
                ? `参加を申請する（残り${remaining}枠）`
                : `プロフィール登録して参加する（残り${remaining}枠）`}
            </button>
            <div className="text-[11px] text-muted text-center mt-2">
              {profileReady
                ? '主催者が承認するまでお待ちください'
                : '次の画面でプロフィールを登録すると、戻ってきて参加申請できます'}
            </div>
          </>
        )}
      </div>

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

      <div className="h-5" />

      {confirmOpen && (
        <ConfirmCourseModal
          roundId={round.id}
          initialPrice={round.price}
          onClose={() => setConfirmOpen(false)}
        />
      )}
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
