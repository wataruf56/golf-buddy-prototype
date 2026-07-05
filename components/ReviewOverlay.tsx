'use client';

import { useState } from 'react';
import { store, useStore, getMe } from '@/lib/store';
import { Avatar } from '@/components/Avatar';
import { toast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

// ラウンド後のレビュー。星評価は廃止。全員について「また一緒に回りたいか」
// （＋異性の相手のみ「異性として気になる」）を選び、まとめて送信する。
type Row = { want: 'yes' | 'no' | null; romantic: boolean; comment: string };

export function ReviewOverlay() {
  const me = useStore(getMe);
  const pending = useStore((s) =>
    s.pendingReviews.filter((p) => p.reviewerId === s.meId && p.status === 'pending')
  );
  const users = useStore((s) => s.users);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);

  if (pending.length === 0) return null;

  const get = (id: string): Row => rows[id] || { want: null, romantic: false, comment: '' };
  const upd = (id: string, patch: Partial<Row>) => setRows((p) => ({ ...p, [id]: { ...get(id), ...patch } }));

  const answered = (r?: Row) => !!r && (r.romantic || r.want !== null);
  const ratedCount = pending.filter((p) => answered(rows[p.id])).length;
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
        if (!answered(r)) continue;
        // 星は廃止。レビュー記録はコメントのみ（pending解消のために送信）。
        await store.submitReview(p.id, 0, [], r.comment || undefined);
        const target = users.find((u) => u.id === p.revieweeId);
        const opp = isOpp(target);
        // 「また回りたい」= はい選択、または「異性として気になる」（=また回りたいを内包）。
        const effAgain = r.want === 'yes' || (opp && r.romantic);
        if (opp && r.romantic) await sendLike(p.roundId, p.revieweeId, 'romantic');
        if (effAgain) await sendLike(p.roundId, p.revieweeId, 'again');
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
          <div className="text-[12px] text-sub mt-0.5">一緒に回った{pending.length}人に「また回りたいか」を選んでください（{ratedCount}/{pending.length}）</div>
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

                {/* また回りたいか（星評価は廃止）。異性の相手は「異性として気になる」も選べ、
                    選択中は専用ボタン1つに切り替える（また回りたいを内包）。 */}
                <div className="mt-1">
                  <div className="text-[12px] font-black text-center mb-1.5">また一緒に回りたいですか？</div>
                  {opp && r.romantic ? (
                    <button
                      onClick={() => upd(p.id, { romantic: false })}
                      className="w-full py-2.5 rounded-full text-[12px] font-bold border-[1.5px] bg-pink-600 text-white border-pink-600"
                    >✓ 💘 異性として気になる（「また回りたい」も含む）</button>
                  ) : (
                    <>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => upd(p.id, { want: 'yes' })}
                          className={cn('flex-1 py-2.5 rounded-full text-[12px] font-bold border-[1.5px]', r.want === 'yes' ? 'bg-green text-white border-green' : 'bg-card border-border text-sub')}
                        >{r.want === 'yes' ? '✓ ' : ''}🏌️ また回りたい</button>
                        <button
                          onClick={() => upd(p.id, { want: 'no' })}
                          className={cn('flex-1 py-2.5 rounded-full text-[12px] font-bold border-[1.5px]', r.want === 'no' ? 'bg-[#9b876a] text-white border-[#9b876a]' : 'bg-card border-border text-sub')}
                        >{r.want === 'no' ? '✓ ' : ''}🙅 今回はいいかな</button>
                      </div>
                      {opp && (
                        <button
                          onClick={() => upd(p.id, { romantic: true, want: 'yes' })}
                          className="w-full mt-1.5 py-2.5 rounded-full text-[12px] font-bold border-[1.5px] bg-card border-border text-sub"
                        >💘 異性として気になる</button>
                      )}
                    </>
                  )}
                  {opp && r.romantic && (
                    <div className="text-[10px] text-pink-600 font-bold mt-1 text-center">「また一緒に回りたい」も自動で含まれます</div>
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
            {busy ? '送信中...' : allRated ? `送信する（${pending.length}人）` : `全員に回答してください（${ratedCount}/${pending.length}）`}
          </button>
        </div>
      </div>
    </div>
  );
}
