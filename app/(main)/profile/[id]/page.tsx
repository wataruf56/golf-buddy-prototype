'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { GolmotiBadge } from '@/components/GolmotiBadge';
import { GolfBallRating } from '@/components/GolfBallRating';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { User } from '@/lib/types';
import { track as logEvent } from '@/lib/telemetry';
import { ProfileDetails } from '@/components/ProfileDetails';
import { chatIdFor, carLabel, instagramUrl } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cachedUser = useStore((s) => s.users.find((u) => u.id === params.id));
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  // メッセージを送れるのは「ゴル友／一緒にラウンド・コンペ／申請・招待の関係／募集中の主催者」
  // のみ（/api/me/can-dm で判定・サーバーの /api/messages も同じ lib/dmPolicy で強制）。
  const isBlocked = (me.blockedUserIds || []).includes(params.id || '');
  const isMe = meId === params.id;
  const [dmAllowed, setDmAllowed] = useState<boolean | null>(null); // null=判定中（ボタン非表示）

  const [user, setUser] = useState<User | undefined>(cachedUser);
  const [notFound, setNotFound] = useState(false);
  const [track, setTrack] = useState<{ roundedWith: number; againCount: number; neverCount: number; hostedCount: number; joinedCount: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  // 通報の種別（カテゴリ）。ドタキャン申告もここに含める。
  const [reportCat, setReportCat] = useState<'' | 'inappropriate' | 'noshow' | 'no_contact' | 'other'>('');
  const [reportBusy, setReportBusy] = useState(false);
  // 共通の友達（自分とこの人が、両方とも同じ組で回ったことがある人）。
  const [mutuals, setMutuals] = useState<Array<{ id: string; displayName: string; avatar: string; avatarUrl?: string }>>([]);

  useEffect(() => {
    if (!params.id) return;
    // 相手が取得できなかった場合（404・BAN・削除・通信失敗）は無限ローディングにせず
    // notFound を立てる。これが無いと「読み込み中」のまま固まる（DMと同種の不具合）。
    fetch(`/api/users/${encodeURIComponent(params.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user) { setUser(d.user); setMutuals(Array.isArray(d.mutualFriends) ? d.mutualFriends : []); } else setNotFound(true); })
      .catch(() => setNotFound(true));
    fetch(`/api/users/${encodeURIComponent(params.id)}/track-record`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTrack({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0, neverCount: d.neverCount || 0, hostedCount: d.hostedCount || 0, joinedCount: d.joinedCount || 0 }))
      .catch(() => {});
  }, [params.id]);

  // DM可否（関係性ゲート）。判定が返るまでボタンは出さない。
  useEffect(() => {
    setDmAllowed(null);
    if (!params.id || !meId || params.id === meId) return;
    let cancelled = false;
    const cid = chatIdFor(meId, params.id);
    fetch(`/api/me/can-dm?userId=${encodeURIComponent(params.id)}&chatId=${encodeURIComponent(cid)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setDmAllowed(!!d.allowed); })
      .catch(() => { /* 判定失敗時はボタンを出さない（サーバー側でも弾かれる） */ });
    return () => { cancelled = true; };
  }, [params.id, meId]);

  async function toggleBlock() {
    setMenuOpen(false);
    const action = isBlocked ? 'unblock' : 'block';
    if (action === 'block' && !(await confirmDialog({ message: `${user?.displayName ?? 'このユーザー'}をブロックしますか？\nお互いにメッセージできなくなります。`, danger: true, confirmText: 'ブロックする' }))) return;
    try {
      const res = await fetch('/api/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: params.id, action }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      logEvent('block_user', { targetId: params.id, on: action === 'block' });
      toast(action === 'block' ? 'ブロックしました' : 'ブロック解除しました');
      const { store } = await import('@/lib/store');
      await store.refreshMe();
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    }
  }

  async function submitReport() {
    if (!reportCat) {
      toast('通報の種類を選んでください', 'error');
      return;
    }
    if (reportBusy) return;
    setReportBusy(true);
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: params.id, reason: reportCat, detail: reportReason.trim() }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      logEvent('report_user', { targetId: params.id, reason: reportCat });
      toast('通報を受け付けました。運営が確認します。');
      setReportOpen(false);
      setReportReason('');
      setReportCat('');
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    } finally {
      setReportBusy(false);
    }
  }

  if (!user) {
    if (notFound) {
      return (
        <div className="px-5 py-3">
          <button onClick={() => router.back()} className="text-sm text-blue font-semibold mb-6">← 戻る</button>
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-sm font-black mb-1">ユーザーが見つかりませんでした</div>
            <div className="text-[12px] text-sub">退会・削除された、または表示できないユーザーの可能性があります。</div>
          </div>
        </div>
      );
    }
    return <div className="p-5 text-sub">読み込み中...</div>;
  }

  const metaLine = [user.age ? `${user.age}歳` : null, user.area, carLabel(user.car)].filter(Boolean).join(' ・ ');

  return (
    <div className="pb-6">
      {/* トップバー（戻る／メニュー）。カバーに重ねて配置。 */}
      <div className="relative">
        <div className="h-28" style={{ background: 'linear-gradient(135deg, #2A8C82 0%, #3FB6A8 55%, #E8643C 165%)' }} />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-3">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-full bg-black/20 text-white flex items-center justify-center backdrop-blur-sm" aria-label="戻る">←</button>
          {!isMe && (
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} className="w-9 h-9 rounded-full bg-black/20 text-white flex items-center justify-center backdrop-blur-sm" aria-label="メニュー">⋯</button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card rounded-xl shadow-lg border border-border min-w-[180px] z-20">
                  <button onClick={toggleBlock} className="w-full text-left px-4 py-3 text-sm font-bold text-text border-b border-border">
                    {isBlocked ? '🔓 ブロック解除' : '🚫 ブロックする'}
                  </button>
                  <button onClick={() => { setMenuOpen(false); setReportOpen(true); }} className="w-full text-left px-4 py-3 text-sm font-bold text-red">
                    🚩 通報する
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 -mt-12">
        {/* アバター＋アクション */}
        <div className="flex items-end justify-between">
          <div className="relative z-10 rounded-full p-1 bg-card inline-block shadow-card">
            <Avatar user={user} size={88} emojiSize={44} />
          </div>
          {!isMe && !isBlocked && dmAllowed === true && (
            <Link href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`} aria-label={`${user.displayName}さんにメッセージを送る`} className="mb-1 px-5 py-2.5 bg-green text-white rounded-full text-sm font-black shadow-card flex items-center gap-1.5">
              <span className="text-base">💬</span> メッセージを送る
            </Link>
          )}
        </div>

        {/* 名前・評価・メタ */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xl font-black tracking-tight">{user.displayName}</span>
            {user.gender === 'male' ? <span className="text-base">👨</span> : user.gender === 'female' ? <span className="text-base">👩</span> : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
            {/* ★は「また回りたい率」を5段階に写像（旧★平均は廃止）。3/3 → ★5.0 */}
            <GolfBallRating value={track && track.roundedWith > 0 ? Math.round((1 - (track.neverCount || 0) / track.roundedWith) * 5 * 2) / 2 : 0} count={track?.roundedWith || 0} size={18} />
            {track && track.roundedWith > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] font-black text-green bg-green-light border border-green rounded-full px-2.5 py-0.5">
                🏌️ また回りたい {track.againCount}/{track.roundedWith}
              </span>
            )}
          </div>
          {track && track.roundedWith > 0 && (
            <div className="text-[11px] text-sub mt-1">この人をレビューした{track.roundedWith}人のうち{track.againCount}人が「また回りたい」と回答</div>
          )}
          {/* マナー/信頼度（運営が通報・ドタキャンを確認して下げる指標）。良好時は控えめに表示。 */}
          <MannerBadge penalty={(user as any).mannerPenalty || 0} />
          {metaLine && <div className="text-[13px] text-sub mt-1.5">{metaLine}</div>}
          {user.golmotiType && (
            <div className="mt-2.5">
              <GolmotiBadge code={user.golmotiType} link />
            </div>
          )}
        </div>

        {/* ステータス行（SNS風）＝ 完了ラウンド（募集＋参加）／ 募集回数 */}
        <div className="mt-4 flex rounded-2xl bg-card shadow-card overflow-hidden">
          <StatCell value={track ? String(track.joinedCount + track.hostedCount) : '—'} label="ラウンド" />
          <div className="w-px bg-border my-3" />
          <StatCell value={track ? String(track.hostedCount) : '—'} label="募集" />
        </div>

        {/* 自己紹介 */}
        {user.bio && (
          <div className="mt-3 bg-card rounded-card p-4 shadow-card text-[13px] text-text leading-relaxed whitespace-pre-wrap">
            {user.bio}
          </div>
        )}

        {/* 詳細プロフィール（マイページと同じUI）。他人を見たときは共通の趣味をハイライト。 */}
        <ProfileDetails user={user} myHobbies={!isMe ? (me as any)?.hobbies : undefined} />

        {/* Instagram */}
        {instagramUrl(user.instagram) && (
          <a
            href={instagramUrl(user.instagram)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 py-3 bg-card rounded-card shadow-card text-[13px] font-black text-pink-600"
          >
            <span className="text-lg">📷</span> Instagram を開く
          </a>
        )}

        {/* 共通の友達（自分とこの人が、両方とも同じ組で回ったことがある人） */}
        {!isMe && mutuals.length > 0 && (
          <div className="mt-3 bg-card rounded-card p-4 shadow-card">
            <div className="text-[13px] font-black mb-2.5">🤝 共通の友達 <span className="text-muted font-bold">{mutuals.length}人</span></div>
            <div className="flex flex-wrap gap-2.5">
              {mutuals.map((m) => (
                <Link key={m.id} href={`/profile/${m.id}`} className="flex flex-col items-center gap-1 w-[60px]">
                  <Avatar user={{ id: m.id, displayName: m.displayName, avatar: m.avatar, avatarUrl: m.avatarUrl, color: '#2A8C82' } as any} size={44} />
                  <span className="text-[10px] text-sub text-center leading-tight truncate w-full">{m.displayName}</span>
                </Link>
              ))}
            </div>
            <div className="text-[10px] text-muted mt-2">※ 過去に同じ組で一緒に回ったことがある人どうしの重なりです。</div>
          </div>
        )}

        {/* 下部アクション／状態 */}
        <div className="mt-4">
          {isMe ? null : isBlocked ? (
            <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">🚫 このユーザーをブロック中</div>
          ) : dmAllowed === true ? (
            <Link href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`} aria-label={`${user.displayName}さんにメッセージを送る`} className="flex items-center justify-center gap-2 w-full py-3.5 bg-green text-white rounded-xl text-[15px] font-black text-center">
              <span className="text-lg">💬</span> {user.displayName}さんにメッセージを送る
            </Link>
          ) : dmAllowed === false ? (
            <div className="text-center py-3 px-4 bg-bg rounded-xl text-[11px] text-sub leading-relaxed">
              💬 メッセージを送れるのは「ゴル友」「一緒にラウンド・コンペを回った人」「参加申請・招待中の相手」「募集中ラウンドの主催者」のみです
            </div>
          ) : null}
        </div>
      </div>

      {reportOpen && (
        <div className="absolute inset-0 bg-black/50 z-[150] flex items-center justify-center p-5 backdrop-blur-sm">
          <div className="bg-card rounded-card p-5 w-full max-w-[350px] shadow-lg">
            <div className="text-lg font-black mb-1">通報</div>
            <div className="text-[12px] text-sub mb-3">{user.displayName} さんを運営に通報します。種類を選んでください。内容は運営が確認します。</div>
            <div className="flex flex-col gap-1.5 mb-3">
              {([
                ['inappropriate', '🚫 不適切な行為・迷惑行為'],
                ['noshow', '🙅 ドタキャン（無断キャンセル）'],
                ['no_contact', '📵 連絡が取れない'],
                ['other', '⚠️ その他'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setReportCat(k)}
                  className={'w-full text-left px-3 py-2.5 rounded-[10px] border-[1.5px] text-[13px] font-bold ' + (reportCat === k ? 'border-red bg-red-50 text-red-600' : 'border-border bg-bg text-sub')}
                >{label}</button>
              ))}
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 500))}
              placeholder="状況をできるだけ詳しく（任意・いつ／どのラウンドで／何があったか）"
              className="w-full h-24 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
            />
            <div className="text-[10px] text-muted text-right mt-0.5">{reportReason.length}/500</div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setReportOpen(false); setReportReason(''); setReportCat(''); }} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold">キャンセル</button>
              <button onClick={submitReport} disabled={reportBusy || !reportCat} className="flex-1 py-3 bg-red text-white rounded-xl text-sm font-bold disabled:opacity-50">{reportBusy ? '送信中…' : '通報する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// マナー/信頼度バッジ。penalty=0 は「良好」を控えめに、1以上は警告色で表示。
function MannerBadge({ penalty }: { penalty: number }) {
  const p = Math.max(0, Math.floor(penalty || 0));
  if (p <= 0) {
    return (
      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green bg-green-light border border-green rounded-full px-2.5 py-0.5">🤝 マナー良好</span>
      </div>
    );
  }
  const label = p === 1 ? '⚠️ 運営から注意あり' : '🚫 要注意（運営確認済み）';
  return (
    <div className="mt-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-600 bg-red-50 border border-red-300 rounded-full px-2.5 py-0.5">
        {label}{p > 1 ? ` ×${p}` : ''}
      </span>
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
