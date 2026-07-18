'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { getMe, store, useStore } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { GolmotiBadge } from '@/components/GolmotiBadge';
import { GolfBallRating } from '@/components/GolfBallRating';
import { NotifySettings } from '@/components/NotifySettings';
import { AppUpdateButton } from '@/components/AppUpdateButton';
import { track } from '@/lib/telemetry';
import { formatDate, instagramUrl } from '@/lib/utils';

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
      r.hostId === s.meId ||
      r.applicantIds.includes(s.meId) ||
      (r.pendingApplicantIds || []).includes(s.meId)
    )
  );
  // 「参加予定」= これから参加する（募集中＝未完了）のラウンドだけ。完了・終了は除く。
  const upcomingRounds = myRounds.filter((r) => r.status === 'open');
  // "ラウンド回数" = COMPLETED rounds I was in (host or approved applicant).
  // Only finished rounds count — open/recruiting ones don't. We take the max
  // of this live count and the stored roundCount (which is incremented at
  // completion time) so completions that have scrolled out of the visible
  // set still count.
  const myCompletedRoundCount = useStore((s) =>
    s.rounds.filter((r) =>
      r.status === 'completed' && (r.hostId === s.meId || r.applicantIds.includes(s.meId))
    ).length
  );
  // Pending applications waiting for ME to approve (across rounds I host)
  const myHostedRounds = useStore((s) => s.rounds.filter((r) => r.hostId === s.meId));
  const pendingForMeAsHost = myHostedRounds.flatMap((r) =>
    (r.pendingApplicantIds || []).map((uid) => ({ round: r, applicantId: uid }))
  );
  // 実績ベース評価：一緒に回った人のうち「また回りたい」を押した人数（相手にも見える指標）。
  const [trackRecord, setTrackRecord] = useState<{ roundedWith: number; againCount: number } | null>(null);
  const [rating, setRating] = useState<{ value: number; count: number } | null>(null);
  const users = useStore((s) => s.users);

  useEffect(() => {
    if (!meId) return;
    fetch(`/api/users/${encodeURIComponent(meId)}/track-record`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTrackRecord({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0 }))
      .catch(() => {});
    fetch(`/api/users/${encodeURIComponent(meId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.user) setRating({ value: d.user.rating || 0, count: d.user.ratingCount || 0 }); })
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

        {/* SNS風プロフィールヘッダー */}
        <div className="bg-card rounded-card shadow-card overflow-hidden mb-4">
          <div className="h-24 relative" style={{ background: 'linear-gradient(135deg, #2A8C82 0%, #3FB6A8 55%, #E8643C 165%)' }}>
            <Link href="/mypage/edit" className="absolute top-3 right-3 px-3.5 py-1.5 bg-white/20 text-white rounded-full text-xs font-black backdrop-blur-sm">✏️ 編集</Link>
          </div>
          <div className="px-5 pb-5 -mt-11">
            <div className="rounded-full p-1 bg-card inline-block shadow-card">
              <Avatar user={me} size={84} emojiSize={42} />
            </div>
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xl font-black tracking-tight">{me.displayName || 'プロフィール'}</span>
                {me.gender === 'male' ? <span className="text-base">👨</span> : me.gender === 'female' ? <span className="text-base">👩</span> : null}
              </div>
              {rating && (
                <div className="mt-1.5">
                  <GolfBallRating value={rating.value} count={rating.count} size={18} />
                </div>
              )}
              <div className="text-[13px] text-sub mt-1.5">
                {[me.age ? `${me.age}歳` : null, me.scoreRange ? `スコア ${me.scoreRange}` : null, me.area || null].filter(Boolean).join(' ・ ') || 'プロフィールを編集してください'}
              </div>
              {me.golmotiType && (
                <div className="mt-2.5">
                  <GolmotiBadge code={me.golmotiType} link />
                </div>
              )}
            </div>

            {/* ステータス行（SNS風） */}
            <div className="mt-4 flex rounded-2xl bg-bg overflow-hidden">
              <StatCell value={trackRecord ? String(trackRecord.againCount) : '—'} label="また回りたい" accent />
              <div className="w-px bg-border my-3" />
              <StatCell value={`${Math.max(me.roundCount || 0, myCompletedRoundCount)}`} label="ラウンド" />
              <div className="w-px bg-border my-3" />
              <StatCell value={`${myHostedRounds.length}`} label="募集" />
            </div>
            {trackRecord && trackRecord.roundedWith > 0 && (
              <div className="mt-2 text-[10px] text-muted leading-relaxed">
                「また回りたい」は、一緒に回った{trackRecord.roundedWith}人のうち{trackRecord.againCount}人が回答した実績です（相手のプロフィールにも表示されます）。
              </div>
            )}

            {me.bio && (
              <div className="mt-3 bg-bg rounded-xl p-3 text-[13px] leading-relaxed whitespace-pre-wrap">{me.bio}</div>
            )}

            {/* タグ */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {me.frequency && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">📅 {me.frequency}</span>}
              {me.golfHistory && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">⛳ ゴルフ歴 {me.golfHistory}</span>}
              {me.car && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">{me.car === 'have' ? '🚗 車あり' : '🚶 車なし'}</span>}
            </div>

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
          </div>
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
              : (r.pendingApplicantIds || []).includes(me.id) ? '承認待ち'
              : '参加';
            return (
              <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-2.5 bg-bg rounded-[10px] mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{r.title}</div>
                  <div className="text-[11px] text-muted">{formatDate(r.date) || r.dateRange} ・ {role}</div>
                </div>
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

function StatCell({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex-1 py-3 text-center">
      <div className={`text-[22px] font-black leading-none ${accent ? 'text-green' : 'text-text'}`}>{value}</div>
      <div className="text-[10px] text-muted mt-1">{label}</div>
    </div>
  );
}
