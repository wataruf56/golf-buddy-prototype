'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import type { Review, User } from '@/lib/types';
import { chatIdFor, formatRating, carLabel } from '@/lib/utils';

export default function ProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cachedUser = useStore((s) => s.users.find((u) => u.id === params.id));
  const meId = useStore((s) => s.meId);
  const me = useStore(getMe);
  const buddyIds = useStore((s) => s.buddyIds);
  const isBuddy = buddyIds.includes(params.id || '');
  const isBlocked = (me.blockedUserIds || []).includes(params.id || '');
  const isMe = meId === params.id;

  const [user, setUser] = useState<User | undefined>(cachedUser);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/users/${encodeURIComponent(params.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.user) setUser(d.user); if (d.reviews) setReviews(d.reviews); })
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
      // Refresh me in store
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

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="text-sm text-blue font-semibold">← 戻る</button>
        {!isMe && (
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="text-2xl text-muted px-2">⋯</button>
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

      {isBlocked && (
        <div className="bg-red-light text-red text-xs font-bold rounded-xl px-3 py-2 mb-4 text-center">
          🚫 このユーザーをブロックしています
        </div>
      )}

      <div className="text-center mb-5">
        <div className="mx-auto mb-3 inline-block">
          <Avatar user={user} size={72} emojiSize={36} />
        </div>
        <div className="text-xl font-black">{user.displayName}</div>
        <div className="text-[13px] text-sub mt-1">{user.age}歳 ・ {user.area}{carLabel(user.car) ? ' ・ ' + carLabel(user.car) : ''}</div>
      </div>

      <div className="flex gap-2 mb-5">
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className={`font-black text-green ${user.reviewCount ? 'text-2xl' : 'text-lg pt-1'}`}>{user.reviewCount ? `★${formatRating(user.reviewAvg)}` : '🆕 初参加'}</div>
          <div className="text-[10px] text-muted mt-0.5">{user.reviewCount ? `${user.reviewCount}件のレビュー` : 'まだレビューがありません'}</div>
        </div>
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className="text-2xl font-black text-blue">{user.scoreRange}</div>
          <div className="text-[10px] text-muted mt-0.5">スコア帯</div>
        </div>
        <div className="flex-1 bg-card rounded-xl p-3.5 text-center shadow-card">
          <div className="text-2xl font-black">{user.roundCount}</div>
          <div className="text-[10px] text-muted mt-0.5">ラウンド</div>
        </div>
      </div>

      <div className="bg-card rounded-card p-4 shadow-card mb-3">
        <div className="text-[13px] font-bold mb-2.5">プロフィール</div>
        <div className="flex flex-wrap gap-1.5">
          {user.gender && (
            <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">
              {user.gender === 'male' ? '👨 男性' : user.gender === 'female' ? '👩 女性' : '🧑 その他'}
            </span>
          )}
          {user.car && (
            <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">
              {user.car === 'have' ? '🚗 車あり' : '🚶 車なし'}
            </span>
          )}
          {user.playStyle && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">🏌️ {user.playStyle}</span>}
          {user.frequency && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">📅 {user.frequency}</span>}
          {user.area && <span className="px-3 py-1.5 bg-bg text-sub text-[11px] font-bold rounded-full">📍 {user.area}</span>}
        </div>
        {user.bio && (
          <div className="mt-3 p-3 bg-bg rounded-xl text-[13px] text-text leading-relaxed whitespace-pre-wrap">
            {user.bio}
          </div>
        )}
      </div>

      {Array.isArray(user.recentScores) && user.recentScores.length > 0 && (() => {
        const sorted = [...user.recentScores].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);
        const avg = Math.round(sorted.reduce((s, x) => s + x.score, 0) / sorted.length);
        return (
          <details className="bg-card rounded-card shadow-card mb-4">
            <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
              <span className="text-[13px] font-bold">直近のスコア</span>
              <span className="text-[11px] text-muted">直近3件 平均 {avg} ▾</span>
            </summary>
            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {sorted.map((s, i) => (
                <div key={i} className="flex justify-between items-center px-3 py-2 bg-bg rounded-[10px]">
                  <span className="text-[12px] text-sub">
                    {new Date(s.date).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </span>
                  <span className="text-[15px] font-black text-green">{s.score}</span>
                </div>
              ))}
            </div>
          </details>
        );
      })()}

      <details className="bg-card rounded-card shadow-card mb-4">
        <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
          <span className="text-[13px] font-bold">レビュー（匿名）</span>
          <span className="text-[11px] text-muted">{reviews.length}件 ▾</span>
        </summary>
        <div className="px-4 pb-4">
        {reviews.length === 0 ? (
          <div className="text-xs text-muted py-3 text-center">まだレビューがありません</div>
        ) : reviews.map((rv) => {
          const r: any = rv;
          const demo = r.reviewer;
          const genderLabel = demo?.gender === 'male' ? '👨 男性'
            : demo?.gender === 'female' ? '👩 女性' : null;
          return (
            <div key={rv.id} className="p-2.5 bg-bg rounded-[10px] mb-2">
              <div className="flex justify-between items-center mb-1 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted font-bold">匿名レビュー</span>
                  {demo?.ageBucket && (
                    <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-full bg-card text-sub border border-border">{demo.ageBucket}歳</span>
                  )}
                  {genderLabel && (
                    <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full ${demo?.gender === 'male' ? 'bg-blue-light text-blue' : 'bg-pink-100 text-pink-600'}`}>{genderLabel}</span>
                  )}
                </div>
                <span className="text-[13px] text-yellow">{'★'.repeat(rv.stars)}{'☆'.repeat(5 - rv.stars)}</span>
              </div>
              {Array.isArray(rv.tags) && rv.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {rv.tags.map((t: string) => (
                    <span key={t} className="text-[10px] px-1.5 py-[1px] rounded-full bg-green-light text-green font-bold">{t}</span>
                  ))}
                </div>
              )}
              {rv.comment && <div className="text-[13px] leading-relaxed">{rv.comment}</div>}
            </div>
          );
        })}
        </div>
      </details>

      {isMe ? null : isBlocked ? (
        <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">
          このユーザーをブロック中
        </div>
      ) : isBuddy ? (
        <Link href={`/chat/${chatIdFor(meId, user.id)}?other=${user.id}`} className="block w-full py-4 bg-green text-white rounded-xl text-[15px] font-bold text-center">
          メッセージを送る
        </Link>
      ) : (
        <div className="text-center py-3 bg-bg rounded-xl text-[13px] text-sub">
          相互レビュー完了でゴル友になります（ラウンド経由でのメッセージは可能）
        </div>
      )}
      <div className="h-5" />

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
