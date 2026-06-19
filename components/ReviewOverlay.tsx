'use client';

import { useState } from 'react';
import { store, useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

// ラウンド後のレビュー＝総合評価＋（異性の相手のみ）マッチング選択。
// タグは廃止。相手ごとに「また一緒に回りたい」「異性として気になる」を選べ、
// 両思い（相互選択）のときだけ双方に通知される。
export function ReviewOverlay() {
  const me = useStore(getMe);
  const pending = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending')
  );
  const users = useStore((s) => s.users);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [again, setAgain] = useState(false);
  const [romantic, setRomantic] = useState(false);
  const [busy, setBusy] = useState(false);

  if (pending.length === 0) return null;
  const current = pending[0];
  const target: User | undefined = users.find((u) => u.id === current.revieweeId);
  if (!target) return null;

  // 異性のときだけマッチング項目を表示（両者の性別が設定済みで異なる）。
  const isOppositeSex =
    (me?.gender === 'male' || me?.gender === 'female') &&
    (target.gender === 'male' || target.gender === 'female') &&
    me.gender !== target.gender;

  const labels = ['', 'もう少し...', '普通', '良い！', 'とても良い！', '最高！'];
  const canSubmit = stars > 0 && !busy;

  async function sendLike(roundId: string, toUserId: string, kind: 'again' | 'romantic') {
    try {
      await fetch(`/api/rounds/${roundId}/match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, kind, on: true }), cache: 'no-store', credentials: 'include',
      });
    } catch { /* best-effort */ }
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    track('review_submit_click', { pendingId: current.id, revieweeId: current.revieweeId, stars });
    try {
      await store.submitReview(current.id, stars, [], comment || undefined);
      // マッチング（異性のみ）。優先度: 異性として気になる > また回りたい。
      // romantic を先に送ると、両方一致時に again 側の通知が抑制される。
      if (isOppositeSex) {
        if (romantic) await sendLike(current.roundId, current.revieweeId, 'romantic');
        if (again) await sendLike(current.roundId, current.revieweeId, 'again');
      }
      track('review_submit_success', { pendingId: current.id });
      toast('送信しました');
      setStars(0); setComment(''); setAgain(false); setRomantic(false);
    } catch (e) {
      track('review_submit_error', { message: (e as Error).message });
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-5 backdrop-blur-sm">
      <div className="bg-card rounded-card p-6 w-full max-w-[350px] shadow-lg max-h-[90%] overflow-y-auto">
        <h3 className="text-lg font-black mb-1">ラウンドレビュー</h3>
        <div className="text-[13px] text-sub mb-4">一緒に回った相手はいかがでしたか？</div>

        <div className="flex items-center gap-3 p-3 bg-bg rounded-xl mb-4">
          <Avatar user={target} size={44} emojiSize={22} />
          <div>
            <div className="text-sm font-bold">{target.displayName}</div>
            <div className="text-[11px] text-sub">
              {target.gender === 'male' ? '👨 男性' : target.gender === 'female' ? '👩 女性' : ''}{target.age ? ` ・ ${target.age}歳` : ''}
            </div>
          </div>
        </div>

        <div className="text-center mb-1 text-xs text-sub">総合評価</div>
        <div className="flex gap-1.5 justify-center my-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setStars(n)} className="text-4xl" style={{ color: n <= stars ? '#E8A93C' : '#E8E6E1' }}>
              {n <= stars ? '★' : '☆'}
            </button>
          ))}
        </div>
        {stars > 0 && <div className="text-center text-[13px] font-bold text-green mb-3">{labels[stars]}</div>}

        {/* マッチング（異性の相手のときだけ表示） */}
        {isOppositeSex && (
          <div className="mb-4">
            <div className="text-xs text-sub mb-2">この人とのマッチング（任意）</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setAgain((v) => !v)}
                className={cn('w-full py-3 rounded-xl text-sm font-bold border-[1.5px]', again ? 'bg-green text-white border-green' : 'bg-bg border-border text-text')}
              >{again ? '✓ ' : ''}🏌️ また一緒に回りたい</button>
              <button
                onClick={() => setRomantic((v) => !v)}
                className={cn('w-full py-3 rounded-xl text-sm font-bold border-[1.5px]', romantic ? 'bg-pink-600 text-white border-pink-600' : 'bg-bg border-border text-text')}
              >{romantic ? '✓ ' : ''}💘 異性として気になる</button>
            </div>
            <div className="text-[10px] text-muted mt-2 leading-relaxed">
              ※ 両思い（お互いに選択）のときだけ相手に通知されます。選ばなければ相手に知られることはありません。
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-xs text-sub mb-1.5">コメント（任意）</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="一緒にラウンドした感想を書いてください"
            className="w-full h-[56px] p-2.5 border-[1.5px] border-border rounded-[10px] text-[13px] resize-none outline-none bg-bg"
          />
        </div>

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={cn('w-full py-3.5 rounded-xl text-[15px] font-bold', canSubmit ? 'bg-green text-white' : 'bg-border text-muted cursor-not-allowed')}
        >
          {busy ? '送信中...' : stars === 0 ? '★をタップして評価してください' : '送信する'}
        </button>
      </div>
    </div>
  );
}
