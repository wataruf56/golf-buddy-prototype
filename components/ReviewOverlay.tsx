'use client';

import { useState } from 'react';
import { store, useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

// ラウンド後のレビュー。4人/コンペなど複数人でも、1画面に全員を並べて
// スクロールしながら一気に「★評価」と（異性の相手のみ）「また回りたい/異性として
// 気になる」を入力し、まとめて送信する。
type Row = { stars: number; again: boolean; romantic: boolean; comment: string };

export function ReviewOverlay() {
  const me = useStore(getMe);
  const pending = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending')
  );
  const users = useStore((s) => s.users);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);

  if (pending.length === 0) return null;

  const get = (id: string): Row => rows[id] || { stars: 0, again: false, romantic: false, comment: '' };
  const upd = (id: string, patch: Partial<Row>) => setRows((p) => ({ ...p, [id]: { ...get(id), ...patch } }));

  const ratedCount = pending.filter((p) => (rows[p.id]?.stars || 0) > 0).length;
  const allRated = ratedCount === pending.length;

  function isOpp(target?: User): boolean {
    return !!(
      (me?.gender === 'male' || me?.gender === 'female') &&
      (target?.gender === 'male' || target?.gender === 'female') &&
      me.gender !== target.gender
    );
  }

  async function sendLike(roundId: string, toUserId: string, kind: 'again' | 'romantic') {
    try {
      await fetch(`/api/rounds/${roundId}/match`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId, kind, on: true }), cache: 'no-store', credentials: 'include',
      });
    } catch { /* best-effort */ }
  }

  async function submitAll() {
    if (!allRated || busy) return;
    setBusy(true);
    track('review_bulk_submit', { count: pending.length });
    try {
      for (const p of pending) {
        const r = get(p.id);
        if (r.stars <= 0) continue;
        await store.submitReview(p.id, r.stars, [], r.comment || undefined);
        const target = users.find((u) => u.id === p.revieweeId);
        if (isOpp(target)) {
          // 優先度: 異性として気になる > また回りたい（romanticを先に送る）
          if (r.romantic) await sendLike(p.roundId, p.revieweeId, 'romantic');
          if (r.again) await sendLike(p.roundId, p.revieweeId, 'again');
        }
      }
      toast('レビューを送信しました');
    } catch (e) {
      toast('送信失敗: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[100] flex flex-col backdrop-blur-sm">
      <div className="bg-card w-full max-w-[400px] mx-auto my-auto h-full sm:h-auto sm:max-h-[94%] rounded-card flex flex-col overflow-hidden shadow-lg">
        {/* ヘッダー（固定） */}
        <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <h3 className="text-lg font-black">ラウンドレビュー</h3>
          <div className="text-[12px] text-sub mt-0.5">一緒に回った{pending.length}人を評価してください（{ratedCount}/{pending.length}）</div>
          <div className="mt-2.5 px-3 py-2.5 bg-green-light rounded-xl text-[12px] text-green font-bold leading-relaxed">
            🔒 「また回りたい」「異性として気になる」は<u>お互いが両思いだった時だけ</u>通知されます。<br />
            相手が選ばなかった場合、あなたの選択が相手に知られることは一切ありません。
          </div>
        </div>

        {/* 全員ぶんスクロール */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {pending.map((p) => {
            const target = users.find((u) => u.id === p.revieweeId);
            if (!target) return null;
            const r = get(p.id);
            const opp = isOpp(target);
            return (
              <div key={p.id} className="bg-bg rounded-xl p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar user={target} size={40} emojiSize={20} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{target.displayName}</div>
                    <div className="text-[11px] text-sub">
                      {target.gender === 'male' ? '👨 男性' : target.gender === 'female' ? '👩 女性' : ''}{target.age ? ` ・ ${target.age}歳` : ''}
                    </div>
                  </div>
                </div>

                {/* 星評価 */}
                <div className="flex gap-1 justify-center mb-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => upd(p.id, { stars: n })} className="text-[30px] leading-none" style={{ color: n <= r.stars ? '#E8A93C' : '#E8E6E1' }}>
                      {n <= r.stars ? '★' : '☆'}
                    </button>
                  ))}
                </div>

                {/* マッチング：また回りたいは全員、異性として気になるは異性のみ */}
                <div className="flex gap-1.5 mt-2">
                  <button
                    onClick={() => upd(p.id, { again: !r.again })}
                    className={cn('flex-1 py-2 rounded-full text-[12px] font-bold border-[1.5px]', r.again ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}
                  >{r.again ? '✓ ' : ''}🏌️ また回りたい</button>
                  {opp && (
                    <button
                      onClick={() => upd(p.id, { romantic: !r.romantic })}
                      className={cn('flex-1 py-2 rounded-full text-[12px] font-bold border-[1.5px]', r.romantic ? 'bg-pink-600 text-white border-pink-600' : 'bg-card border-border text-sub')}
                    >{r.romantic ? '✓ ' : ''}💘 異性として気になる</button>
                  )}
                </div>

                {/* コメント（任意） */}
                <input
                  value={r.comment}
                  onChange={(e) => upd(p.id, { comment: e.target.value })}
                  placeholder="ひとこと（任意）"
                  maxLength={200}
                  className="w-full mt-2 px-3 py-2 border-[1.5px] border-border rounded-[10px] text-[13px] bg-card outline-none"
                />
              </div>
            );
          })}
        </div>

        {/* 送信（固定） */}
        <div className="px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={submitAll}
            disabled={!allRated || busy}
            className={cn('w-full py-3.5 rounded-xl text-[15px] font-bold', allRated && !busy ? 'bg-green text-white' : 'bg-border text-muted cursor-not-allowed')}
          >
            {busy ? '送信中...' : allRated ? `全員分のレビューを送信する（${pending.length}人）` : `全員を評価してください（${ratedCount}/${pending.length}）`}
          </button>
        </div>
      </div>
    </div>
  );
}
