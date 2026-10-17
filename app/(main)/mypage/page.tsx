'use client';

import { RoundChatNewBadge } from '@/components/RoundChatNewBadge';
import Link from 'next/link';
import { PastRoundsList } from '@/components/PastRoundsList';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { getMe, store, useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { FriendTodoBanner } from '@/components/FriendTodoBanner';
import { GolmotiBadge } from '@/components/GolmotiBadge';
import { NotifySettings } from '@/components/NotifySettings';
import { AppUpdateButton } from '@/components/AppUpdateButton';
import { track } from '@/lib/telemetry';
import { formatDate, instagramUrl } from '@/lib/utils';
import { activeHoldOf } from '@/lib/roundHold';
import { ProfileDetails } from '@/components/ProfileDetails';

const isDemo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const BOT_BASIC_ID = process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID || '';

export default function MyPage() {
  const router = useRouter();
  const me = useStore(getMe);
  const meId = useStore((s) => s.meId);
  const [showAddBotModal, setShowAddBotModal] = useState(false);
  const [showNotifySettings, setShowNotifySettings] = useState(false);
  const myRounds = useStore((s) =>
    s.rounds.filter((r) =>
      !(r as any).availDate && (   // 「行ける日」の集まりは並べない（入口は下のタブ「行ける日」）
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.pendingApplicantIds || []).includes(s.meId))
    )
  );
  // 「参加予定」= 自分が主催 or 参加/申請中で、まだ完了していないラウンド（募集中open＋
  // 締切closed の両方。参加後に締め切られても残る）。開催日の昇順（日程未定は末尾）。
  const upcomingRounds = myRounds
    .filter((r) => r.status !== 'completed')
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : Infinity;
      const bm = b.date ? new Date(b.date).getTime() : Infinity;
      return am - bm;
    });
  // 「過去参加したラウンド」= 自分が主催 or 参加した完了済みラウンド。開催日（なければ
  // 完了時刻）の新しい順。ここから当時の詳細（参加者・レビュー等）にまた飛べる。
  const pastRounds = myRounds
    .filter((r) => r.status === 'completed')
    .slice()
    .sort((a, b) => {
      const am = a.date ? new Date(a.date).getTime() : (a.completedAt || 0);
      const bm = b.date ? new Date(b.date).getTime() : (b.completedAt || 0);
      return bm - am;
    });
  // "ラウンド回数" = COMPLETED rounds I was in (host or approved applicant).
  // Only finished rounds count — open/recruiting ones don't. We take the max
  // of this live count and the stored roundCount (which is incremented at
  // completion time) so completions that have scrolled out of the visible
  // set still count.
  const myCompletedRoundCount = useStore((s) =>
    s.rounds.filter((r) =>
      r.eventType !== 'drink' && r.status === 'completed' && (r.hostId === s.meId || r.applicantIds.includes(s.meId))
    ).length
  );
  // Pending applications waiting for ME to approve (across rounds I host)
  const myHostedRounds = useStore((s) => s.rounds.filter((r) => r.hostId === s.meId));
  const pendingForMeAsHost = myHostedRounds.flatMap((r) =>
    (r.pendingApplicantIds || []).map((uid) => ({ round: r, applicantId: uid }))
  );
  // 実績ベース評価：一緒に回った人のうち「また回りたい」を押した人数（相手にも見える指標）。
  const [trackRecord, setTrackRecord] = useState<{ roundedWith: number; againCount: number; neverCount: number; mannerPenalty?: number; hostedCount: number; joinedCount: number; officialCount?: number; recruitCount?: number; friendCount?: number } | null>(null);
  const users = useStore((s) => s.users);

  useEffect(() => {
    if (!meId) return;
    fetch(`/api/users/${encodeURIComponent(meId)}/track-record`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTrackRecord({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0, neverCount: d.neverCount || 0, mannerPenalty: d.mannerPenalty || 0, hostedCount: d.hostedCount || 0, joinedCount: d.joinedCount || 0, officialCount: d.officialCount || 0, recruitCount: d.recruitCount ?? d.hostedCount ?? 0, friendCount: d.friendCount || 0 }))   // 運営ペナルティも取り込む（落としていて★が下がらなかった）。公式コンペ数も落としていて常に0だった（2026-10-14）
      .catch(() => {});
    track('mypage_render', {
      meId,
      displayName: me.displayName,
      age: me.age,
      area: me.area,
      hasAvatarUrl: !!me.avatarUrl,
      avatarUrlLength: me.avatarUrl?.length || 0,
    });
  }, [meId, me.displayName, me.avatarUrl]);

  async function logout() {
    if (isDemo) { router.push('/login'); return; }
    // NextAuth だけでなく、LIFF/テストログイン用の __session Cookie も消す。
    // これをしないと __session が残り、「ログアウトしたのに再ログイン状態に戻る」
    // （getMeId が __session にフォールバックするため）。
    try { await fetch('/api/auth/liff', { method: 'DELETE', cache: 'no-store', credentials: 'include' }); } catch { /* noop */ }
    signOut({ callbackUrl: '/login' });
  }

  return (
    <>
      <div className="px-5 pt-2 pb-4">
        <div className="text-2xl font-black tracking-tight">マイページ</div>
      </div>

      {/* 使い方（2026-10-17・下のタブから外してここへ。初めての人には GuideIntroPopup でも案内） */}
      <div className="px-5 mb-3">
        <Link href="/guide" className="flex items-center gap-3 bg-card rounded-card shadow-card px-4 py-3 border-2 border-green">
          <span className="text-2xl">📖</span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-black">ゴルトモの使い方</div>
            <div className="text-[11px] text-sub">探し方・募集・行ける日・ゴル友・タブごとの機能</div>
          </div>
          <span className="text-green font-black">›</span>
        </Link>
      </div>

      <div className="px-5">
        {pendingForMeAsHost.length > 0 && (
          <div className="bg-orange-light border-2 border-orange rounded-card p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">📥</span>
              <div className="text-sm font-black text-orange">
                参加申請が {pendingForMeAsHost.length} 件届いています
              </div>
            </div>
            <div className="space-y-2 mt-3">
              {pendingForMeAsHost.slice(0, 5).map(({ round, applicantId }) => {
                const u = users.find((x) => x.id === applicantId);
                return (
                  <Link
                    key={`${round.id}_${applicantId}`}
                    href={`/round/${round.id}`}
                    className="flex items-center gap-2 bg-card rounded-lg p-2.5"
                  >
                    <div className="w-8 h-8 rounded-full bg-bg flex items-center justify-center text-base flex-shrink-0">
                      {u?.avatar || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold truncate">
                        {u?.displayName || '申請者'} さん
                      </div>
                      <div className="text-[11px] text-sub truncate">{round.title}</div>
                    </div>
                    <span className="text-xs text-orange font-bold flex-shrink-0">承認 →</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* 友達申請・QRの「同じ組？」・評価のやり残し */}
        <FriendTodoBanner variant="row" />

        {/* SNS風プロフィールヘッダー */}
        <div className="bg-card rounded-card shadow-card overflow-hidden mb-4">
          <div className="h-24 relative" style={{ background: 'linear-gradient(135deg, #2A8C82 0%, #3FB6A8 55%, #E8643C 165%)' }}>
            <Link href="/mypage/edit" className="absolute top-3 right-3 px-3.5 py-1.5 bg-white/20 text-white rounded-full text-xs font-black backdrop-blur-sm">✏️ 編集</Link>
          </div>
          <div className="px-5 pb-5 -mt-11">
            <div className="relative z-10 rounded-full p-1 bg-card inline-block shadow-card">
              <Avatar user={me} size={84} emojiSize={42} />
            </div>
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xl font-black tracking-tight">{me.displayName || 'プロフィール'}</span>
                {me.gender === 'male' ? <span className="text-base">👨</span> : me.gender === 'female' ? <span className="text-base">👩</span> : null}
              </div>
              {/* 自分への評価（★・また回りたい）は本人には出さない（2026-10-04 本人判断）。
                  他の人のプロフィールでだけ見える。※ 2026-09-19 の「下がった★を本人にも出す」はここで取り下げ。 */}
              <div className="text-[13px] text-sub mt-1.5">
                {[me.age ? `${me.age}歳` : null, me.scoreRange ? `スコア ${me.scoreRange}` : null, me.area || null].filter(Boolean).join(' ・ ') || 'プロフィールを編集してください'}
              </div>
              {me.golmotiType && (
                <div className="mt-2.5">
                  <GolmotiBadge code={me.golmotiType} link />
                </div>
              )}
            </div>

            {/* ステータス行 ＝ 完了ラウンド（募集して完了＋参加して完了）／ 募集回数 */}
            <div className="mt-4 flex rounded-2xl bg-bg overflow-hidden">
              {/* 一番左＝友達の数（ゴル友の友達リストに出る人数・2026-10-14）。タップでゴル友へ */}
              <Link href="/buddies" className="flex-1"><StatCell value={trackRecord ? String(trackRecord.friendCount ?? 0) : '—'} label="友達" /></Link>
              <div className="w-px bg-border my-3" />
              <StatCell value={trackRecord ? String(trackRecord.hostedCount + trackRecord.joinedCount) : `${myCompletedRoundCount}`} label="ラウンド" sub={trackRecord ? `内、公式コンペ ${trackRecord.officialCount ?? 0}回` : undefined} />
              <div className="w-px bg-border my-3" />
              <StatCell value={`${trackRecord?.recruitCount ?? myHostedRounds.length}`} label="募集" />
            </div>

            {me.bio && (
              <div className="mt-3 bg-bg rounded-xl p-3 text-[13px] leading-relaxed whitespace-pre-wrap">{me.bio}</div>
            )}

            {/* QRコードで友達 ＋ Instagram */}
            <div className="flex gap-2 mt-3">
              <Link href="/qr" className="flex-1 bg-bg rounded-xl p-3 flex items-center gap-2 justify-center text-sm font-black text-green">
                <span className="text-lg">🤝</span> QRコードで友達
              </Link>
              {instagramUrl(me.instagram) && (
                <a
                  href={instagramUrl(me.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-bg rounded-xl p-3 flex items-center gap-2 justify-center text-sm font-black text-pink-600"
                >
                  <span className="text-lg">📷</span> Instagram
                </a>
              )}
            </div>

            {/* プロフィール詳細（マッチングアプリ風・QR/Instagramの下にまとめて表示） */}
            <ProfileDetails user={me} editHref="/mypage/edit" />
          </div>
        </div>


        {/* 🏁 過去のラウンド（2026-10-17・下のタブ「過去ラウンド」をここへ移した。押すとその日のグループチャット・📷でアルバム） */}
        <div className="bg-card rounded-card shadow-card mb-4 p-4 border-2 border-green">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-[17px] font-black">🏁 過去のラウンド</span>
            <span className="text-[11px] text-muted font-bold">{pastRounds.length}件</span>
          </div>
          <div className="text-[11px] text-sub mb-2.5">押すと、その日のグループチャットが開きます。📷 はアルバムに写真があるラウンドです。</div>
          <PastRoundsList />
        </div>

        <details className="bg-card rounded-card shadow-card mb-4" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
            <span className="text-[13px] font-bold">参加予定のラウンド</span>
            <span className="text-[11px] text-muted">{upcomingRounds.length}件 ▾</span>
          </summary>
          <div className="px-4 pb-4">
          {upcomingRounds.length === 0 ? (
            <div className="text-xs text-muted py-3 text-center">参加予定のラウンドはありません</div>
          ) : upcomingRounds.map((r) => {
            const role = r.hostId === me.id
              ? '主催'
              : r.applicantIds.includes(me.id) ? '参加確定'
              : (r.pendingApplicantIds || []).includes(me.id) ? (activeHoldOf(r, me.id) ? '⏸ 保留中' : '承認待ち')
              : '参加';
            return (
              <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-2.5 bg-bg rounded-[10px] mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{r.title}</div>
                  <div className="text-[11px] text-muted">{formatDate(r.date) || r.dateRange} ・ {role}</div>
                </div>
                <RoundChatNewBadge roundId={r.id} className="mr-1.5" />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === 'open' ? 'bg-green-light text-green' : r.status === 'completed' ? 'bg-blue-light text-blue' : 'bg-bg text-sub'}`}>
                  {r.status === 'open' ? '募集中' : r.status === 'completed' ? '完了' : '終了'}
                </span>
              </Link>
            );
          })}
          </div>
        </details>


        <details className="bg-card rounded-card shadow-card mb-4">
          <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
            <span className="text-[13px] font-bold">⚙️ その他の設定</span>
            <span className="text-[11px] text-muted">▾</span>
          </summary>
          <div className="px-3 pb-3 flex flex-col gap-1.5">
            <button
              onClick={() => {
                setShowNotifySettings(true);
                if (BOT_BASIC_ID && typeof window !== 'undefined') {
                  const added = localStorage.getItem('gb_bot_added') === '1';
                  if (!added) setShowAddBotModal(true);
                }
              }}
              className="w-full bg-bg rounded-xl px-4 py-3 flex justify-between items-center text-left"
            >
              <span className="text-sm font-medium">🔔 LINE通知の設定</span>
              <span className="text-muted">›</span>
            </button>
            <button onClick={logout} className="w-full bg-bg rounded-xl px-4 py-3 flex justify-between items-center text-left">
              <span className="text-sm font-medium text-red">ログアウト</span>
              <span className="text-muted">›</span>
            </button>
            <AppUpdateButton />
          </div>
        </details>
      </div>
      <div className="h-5" />

      {showNotifySettings && (
        <NotifySettings onClose={() => setShowNotifySettings(false)} />
      )}

      {showAddBotModal && BOT_BASIC_ID && (
        <AddBotModal
          botBasicId={BOT_BASIC_ID}
          onConfirmed={() => {
            try { localStorage.setItem('gb_bot_added', '1'); } catch {}
            setShowAddBotModal(false);
          }}
          onLater={() => setShowAddBotModal(false)}
        />
      )}
    </>
  );
}

function AddBotModal({ botBasicId, onConfirmed, onLater }: { botBasicId: string; onConfirmed: () => void; onLater: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/50 z-[160] flex items-center justify-center p-5 backdrop-blur-sm">
      <div className="bg-card rounded-card p-5 w-full max-w-[340px] shadow-lg">
        <div className="text-center text-3xl mb-2">🔔</div>
        <div className="text-base font-black text-center mb-1">公式アカウントを友だち追加</div>
        <div className="text-[12px] text-sub leading-relaxed mb-4">
          LINE 通知を受け取るには、ゴルトモの公式アカウントを友だち追加する必要があります。<br />
          下のボタンから追加してください。
        </div>
        <a
          href={`https://line.me/R/ti/p/@${botBasicId.replace(/^@/, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 bg-[#06C755] text-white text-sm font-bold rounded-xl text-center mb-2"
        >
          💬 LINE で友だち追加
        </a>
        <button
          onClick={onConfirmed}
          className="w-full py-2.5 bg-bg text-text border border-border rounded-xl text-sm font-bold mb-1.5"
        >
          追加した
        </button>
        <button
          onClick={onLater}
          className="w-full py-2 text-muted text-xs font-bold"
        >
          あとで
        </button>
      </div>
    </div>
  );
}

function StatCell({ value, label, accent, sub }: { value: string; label: string; accent?: boolean; sub?: string }) {
  return (
    <div className="flex-1 py-3 text-center">
      <div className={`text-[22px] font-black leading-none ${accent ? 'text-green' : 'text-text'}`}>{value}</div>
      <div className="text-[10px] text-muted mt-1">{label}</div>
      {sub && <div className="text-[9.5px] font-bold text-orange mt-0.5">🏆 {sub}</div>}
    </div>
  );
}
