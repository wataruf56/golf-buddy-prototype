'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { GolmotiBadge } from '@/components/GolmotiBadge';
import { GolfBallRating } from '@/components/GolfBallRating';
import { toast } from '@/components/Toast';
import type { User } from '@/lib/types';
import { chatIdFor, carLabel, instagramUrl } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cachedUser = useStore((s) => s.users.find((u) => u.id === params.id));
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const buddyIds = useStore((s) => s.buddyIds);
  // ゴル友（相互レビュー）＝buddy、QRコードで直接つながった友達＝friend。どちらもDMできる。
  const isFriend = (me.friendIds || []).includes(params.id || '');
  const isBuddy = buddyIds.includes(params.id || '') || isFriend;
  const isBlocked = (me.blockedUserIds || []).includes(params.id || '');
  const isMe = meId === params.id;

  const [user, setUser] = useState<User | undefined>(cachedUser);
  const [track, setTrack] = useState<{ roundedWith: number; againCount: number; hostedCount: number; joinedCount: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/users/${encodeURIComponent(params.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); })
      .catch(() => {});
    fetch(`/api/users/${encodeURIComponent(params.id)}/track-record`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTrack({ roundedWith: d.roundedWith || 0, againCount: d.againCount || 0, hostedCount: d.hostedCount || 0, joinedCount: d.joinedCount || 0 }))
      .catch(() => {});
  }, [params.id]);

  async function toggleBlock() {
    setMenuOpen(false);
    const action = isBlocked ? 'unblock' : 'block';
    if (action === 'block' && !confirm(`${user?.displayName ?? 'このユーザー'}をブロックしますか？\nお互いにメッセージできなくなります。`)) return;
    try {
      const res = await fetch('/api/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: params.id, action }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast(action === 'block' ? 'ブロックしました' : 'ブロック解除しました');
      const { store } = await import('@/lib/store');
      await store.refreshMe();
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    }
  }

  async function submitReport() {
    if (!reportReason.trim()) {
      toast('通報理由を入力してください', 'error');
      return;
    }
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: params.id, reason: reportReason }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      toast('通報を受け付けました');
      setReportOpen(false);
      setReportReason('');
    } catch (e) {
      toast('失敗: ' + (e as Error).message, 'error');
    }
  }

  if (!user) return <div className="p-5 text-sub">読み込み中...</div>;

  const againPct = track && track.roundedWith > 0 ? Math.round((track.againCount / track.roundedWith) * 100) : null;
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
          <div className="rounded-full p-1 bg-card inline-block shadow-card">
            <Avatar user={user} size={88} emojiSize={44} />
          </div>
          {!isMe && !isBlocked && isBuddy && (
            <Link href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`} className="mb-1 px-5 py-2.5 bg-green text-white rounded-full text-sm font-black shadow-card">
              💬 メッセージ
            </Link>
          )}
        </div>

        {/* 名前・評価・メタ */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xl font-black tracking-tight">{user.displayName}</span>
            {user.gender === 'male' ? <span className="text-base">👨</span> : user.gender === 'female' ? <span className="text-base">👩</span> : null}
          </div>
          <div className="mt-1.5">
            <GolfBallRating value={(user as any).rating || 0} count={(user as any).ratingCount || 0} size={18} />
          </div>
          {metaLine && <div className="text-[13px] text-sub mt-1.5">{metaLine}</div>}
          {user.golmotiType && (
            <div className="mt-2.5">
              <GolmotiBadge code={user.golmotiType} link />
            </div>
          )}
        </div>

        {/* ステータス行（SNS風） */}
        <div className="mt-4 flex rounded-2xl bg-card shadow-card overflow-hidden">
          <StatCell value={track ? String(track.joinedCount + track.hostedCount) : '—'} label="ラウンド" />
          <div className="w-px bg-border my-3" />
          <StatCell value={track ? String(track.againCount) : '—'} label="また回りたい" accent />
          <div className="w-px bg-border my-3" />
          <StatCell value={track ? String(track.hostedCount) : '—'} label="募集" />
        </div>

        {/* また回りたい率（信頼の指標） */}
        {againPct !== null && (
          <div className="mt-3 bg-green-light border-[1.5px] border-green rounded-card px-4 py-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-black text-green">🏌️ また回りたいと思われた率</span>
              <span className="text-[20px] leading-none font-black text-green ml-auto">{againPct}%</span>
            </div>
            <div className="text-[11px] text-sub mt-1">
              一緒に回った <b className="text-text">{track!.roundedWith}人</b> のうち <b className="text-green">{track!.againCount}人</b> が「また回りたい」と回答。
            </div>
          </div>
        )}

        {/* 自己紹介 */}
        {user.bio && (
          <div className="mt-3 bg-card rounded-card p-4 shadow-card text-[13px] text-text leading-relaxed whitespace-pre-wrap">
            {user.bio}
          </div>
        )}

        {/* タグ */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {user.frequency && <Tag>📅 {user.frequency}</Tag>}
          {user.golfHistory && <Tag>⛳ ゴルフ歴 {user.golfHistory}</Tag>}
          {user.scoreRange && <Tag>🎯 {user.scoreRange}</Tag>}
          {user.car && <Tag>{user.car === 'have' ? '🚗 車あり' : '🚶 車なし'}</Tag>}
          {user.area && <Tag>📍 {user.area}</Tag>}
        </div>

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

        {/* 下部アクション／状態 */}
        <div className="mt-4">
          {isMe ? null : isBlocked ? (
            <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">🚫 このユーザーをブロック中</div>
          ) : isBuddy ? (
            <Link href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`} className="block w-full py-3.5 bg-green text-white rounded-xl text-[15px] font-black text-center">
              💬 メッセージを送る
            </Link>
          ) : (
            <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">
              QRで友達になるか、相互レビュー完了でメッセージできます
            </div>
          )}
        </div>
      </div>

      {reportOpen && (
        <div className="absolute inset-0 bg-black/50 z-[150] flex items-center justify-center p-5 backdrop-blur-sm">
          <div className="bg-card rounded-card p-5 w-full max-w-[350px] shadow-lg">
            <div className="text-lg font-black mb-1">通報</div>
            <div className="text-[12px] text-sub mb-4">{user.displayName} さんを通報します。理由を教えてください。</div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 500))}
              placeholder="例: 不適切なメッセージを送ってきた"
              className="w-full h-28 p-3 border-[1.5px] border-border rounded-[10px] text-sm bg-bg outline-none resize-none"
            />
            <div className="text-[10px] text-muted text-right mt-0.5">{reportReason.length}/500</div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setReportOpen(false); setReportReason(''); }} className="flex-1 py-3 bg-bg text-sub rounded-xl text-sm font-bold">キャンセル</button>
              <button onClick={submitReport} className="flex-1 py-3 bg-red text-white rounded-xl text-sm font-bold">通報する</button>
            </div>
          </div>
        </div>
      )}
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

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="px-3 py-1.5 bg-card shadow-card text-sub text-[11px] font-bold rounded-full">{children}</span>;
}
