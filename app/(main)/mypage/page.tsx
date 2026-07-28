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
import { drinkLabel, smokeLabel } from '@/lib/lifestyle';

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
  const [trackRecord, setTrackRecord] = useState<{ roundedWith: number; againCount: number; neverCount: number; hostedCount: number; joinedCount: number } | null>(null);
  const users = useStore((s) => s.users);

  useEffect(() => {
    if (!meId) return;
    fetch(`/api/users/${encodeURIComponent(meId)}/track-record`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTrackRecord({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0, neverCount: d.neverCount || 0, hostedCount: d.hostedCount || 0, joinedCount: d.joinedCount || 0 }))
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
            <div className="relative z-10 rounded-full p-1 bg-card inline-block shadow-card">
              <Avatar user={me} size={84} emojiSize={42} />
            </div>
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xl font-black tracking-tight">{me.displayName || 'プロフィール'}</span>
                {me.gender === 'male' ? <span className="text-base">👨</span> : me.gender === 'female' ? <span className="text-base">👩</span> : null}
              </div>
              <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                {/* ★は「また回りたい率」を5段階に写像（旧★平均は廃止）。3/3 → ★5.0 */}
                <GolfBallRating value={trackRecord && trackRecord.roundedWith > 0 ? Math.round((1 - (trackRecord.neverCount || 0) / trackRecord.roundedWith) * 5 * 2) / 2 : 0} count={trackRecord?.roundedWith || 0} size={18} />
                {trackRecord && trackRecord.roundedWith > 0 && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-black text-green bg-green-light border border-green rounded-full px-2.5 py-0.5">
                    🏌️ また回りたい {trackRecord.againCount}/{trackRecord.roundedWith}
                  </span>
                )}
              </div>
              {trackRecord && trackRecord.roundedWith > 0 && (
                <div className="text-[11px] text-sub mt-1">あなたをレビューした{trackRecord.roundedWith}人のうち{trackRecord.againCount}人が「また回りたい」と回答</div>
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

            {/* ステータス行 ＝ 完了ラウンド（募集して完了＋参加して完了）／ 募集回数 */}
            <div className="mt-4 flex rounded-2xl bg-bg overflow-hidden">
              <StatCell value={trackRecord ? String(trackRecord.hostedCount + trackRecord.joinedCount) : `${myCompletedRoundCount}`} label="ラウンド" />
              <div className="w-px bg-border my-3" />
              <StatCell value={`${myHostedRounds.length}`} label="募集" />
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
            <div className="mt-3 bg-bg rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-black text-sub">プロフィール</span>
                <Link href="/mypage/edit" className="text-[11px] font-bold text-blue">編集 ›</Link>
              </div>
              <div className="flex flex-col divide-y divide-border">
                <InfoRow label="🗓️ いける曜日" value={me.availableDays} />
                <InfoRow label="🎯 スコア帯" value={me.scoreRange} />
                <InfoRow label="📍 エリア" value={me.area} />
                <InfoRow label="⛳ ゴルフ歴" value={me.golfHistory} />
                <InfoRow label="📅 頻度" value={me.frequency} />
                <InfoRow label="🚗 車" value={me.car ? (me.car === 'have' ? 'あり' : 'なし') : ''} />
                <InfoRow label="🍶 お酒" value={drinkLabel(me.drinkStatus)} />
                <InfoRow label="🚬 タバコ" value={smokeLabel(me.smokeStatus)} />
                <InfoRow label="💼 仕事" value={me.job} />
              </div>
              {/* 趣味タグ */}
              <div className="mt-2.5 pt-2.5 border-t border-border">
                <div className="text-[12px] font-black text-sub mb-1.5">🎯 趣味</div>
                {Array.isArray(me.hobbies) && me.hobbies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {me.hobbies.map((h) => (
                      <span key={h} className="px-3 py-1.5 bg-card border border-border text-sub text-[12px] font-bold rounded-full">{h}</span>
                    ))}
                  </div>
                ) : (
                  <Link href="/mypage/edit" className="text-[12px] text-blue font-bold">＋ 趣味を追加する</Link>
                )}
              </div>
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
            <span className="text-[13px] font-bold">過去参加したラウンド</span>
            <span className="text-[11px] text-muted">{pastRounds.length}件 ▾</span>
          </summary>
          <div className="px-4 pb-4">
          {pastRounds.length === 0 ? (
            <div className="text-xs text-muted py-3 text-center">完了したラウンドはまだありません</div>
          ) : pastRounds.map((r) => {
            const role = r.hostId === me.id ? '主催' : '参加';
            return (
              <Link href={`/round/${r.id}`} key={r.id} className="flex justify-between items-center p-2.5 bg-bg rounded-[10px] mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold truncate">{r.title}</div>
                  <div className="text-[11px] text-muted">{formatDate(r.date) || r.dateRange} ・ {role}</div>
                </div>
                <span className="text-[11px] text-blue font-bold flex-shrink-0 ml-2">詳細 →</span>
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

// プロフィール詳細の1行（値がある時だけ表示）。マッチングアプリ風の label:value 行。
function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <span className="text-[12px] text-muted font-bold flex-shrink-0">{label}</span>
      <span className="text-[13px] font-bold text-text text-right truncate">{value}</span>
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
