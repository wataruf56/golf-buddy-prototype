'use client';

import { useState } from 'react';
import { reviewTags } from '@/lib/mockData';
import { store, useStore } from '@/lib/store';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ReviewOverlay() {
  const meId = useStore((s) => s.meId);
  const pending = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending')
  );
  const users = useStore((s) => s.users);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  if (pending.length === 0) return null;
  const current = pending[0];
  const target: User | undefined = users.find((u) => u.id === current.revieweeId);
  if (!target) return null;

  const labels = ['', 'もう少し...', '普通', '良い！', 'とても良い！', '最高！'];

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function submit() {
    if (stars === 0) return;
    store.submitReview(current.id, stars, tags, comment || undefined);
    setStars(0); setTags([]); setComment('');
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[100] flex items-center justify-center p-5 backdrop-blur-sm">
      <div className="bg-card rounded-card p-7 w-full max-w-[350px] shadow-lg">
        <h3 className="text-lg font-black mb-1">ラウンドレビュー</h3>
        <div className="text-[13px] text-sub mb-5">直近のラウンドはいかがでしたか？</div>

        <div className="flex items-center gap-3 p-3 bg-bg rounded-xl mb-3">
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl" style={{ background: `${target.color}22` }}>
            {target.avatar}
          </div>
          <div>
            <div className="text-sm font-bold">{target.displayName}</div>
            <div className="text-[11px] text-sub">{target.age}歳 ・ {target.scoreRange}</div>
          </div>
        </div>

        <div className="text-center mb-1 text-xs text-sub">総合評価</div>
        <div className="flex gap-1.5 justify-center my-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setStars(n)}
              className="text-4xl"
              style={{ color: n <= stars ? '#F4C542' : '#E8E6E1' }}
            >
              {n <= stars ? '★' : '☆'}
            </button>
          ))}
        </div>
        {stars > 0 && (
          <div className="text-center text-[13px] font-bold text-green mb-3">{labels[stars]}</div>
        )}

        <div className="text-xs text-sub mb-2">タグ（任意）</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {reviewTags.map((t) => {
            const sel = tags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-xs font-semibold border-[1.5px] transition-all',
                  sel ? 'bg-green-light border-green text-green' : 'bg-card border-border text-text'
                )}
              >
                {t}
              </button>
            );
          })}
        </div>

        <div className="mb-4">
          <div className="text-xs text-sub mb-1.5">コメント（任意）</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="一緒にラウンドした感想を書いてください"
            className="w-full h-[60px] p-2.5 border-[1.5px] border-border rounded-[10px] text-[13px] resize-none outline-none bg-bg"
          />
        </div>

        <button
          onClick={submit}
          disabled={stars === 0}
          className={cn(
            'w-full py-3.5 rounded-xl text-[15px] font-bold',
            stars > 0 ? 'bg-green text-white hover:bg-green-dark' : 'bg-border text-muted cursor-not-allowed'
          )}
        >
          {stars > 0 ? 'レビューを送信する' : '★をタップして評価してください'}
        </button>
      </div>
    </div>
  );
}
