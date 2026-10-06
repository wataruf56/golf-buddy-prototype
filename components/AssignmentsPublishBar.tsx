'use client';

import { useState } from 'react';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { Round } from '@/lib/types';

// 組み分け・配車は、主催者が「公開する」を押すまで参加者に見えない（2026-10-06 本人要望）。
// 主催者の盤面（組み分け・配車）の上に置く。両方の盤面で同じ1つの状態を切り替える。
// 旧データ（assignmentsPublished が未設定）は、これまでどおり見えている扱い（急に隠さない）。
export function AssignmentsPublishBar({ round }: { round: Round }) {
  const [busy, setBusy] = useState(false);
  const published = round.assignmentsPublished !== false;

  async function set(next: boolean) {
    if (busy) return;
    if (next && !(await confirmDialog('組み分け・配車を参加者に公開しますか？\n公開すると参加者に通知が届き、「組み分け」「ピックアップ」タブで見られるようになります。'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/publish-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: next }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds();
      toast(next ? '参加者に公開しました（通知を送りました）' : '非公開に戻しました（主催者だけに見えます）');
    } catch (e) {
      toast('切り替えに失敗しました: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  // まだ何も組んでいない間は、大きなボタンを出さず一言だけ（押すものが無いのに「公開」があると迷う）
  const hasContent = (round.groups?.length || 0) + (round.groupsBack?.length || 0) + (round.carAssignments?.length || 0) > 0;
  if (!published && !hasContent) {
    return (
      <div className="mb-3 px-3 py-2 rounded-xl bg-bg text-[11px] text-sub leading-relaxed">
        🔒 組み分け・配車は、作ったあとに「参加者に公開する」を押すまで参加者には見えません。
      </div>
    );
  }
  if (!published) {
    return (
      <div className="mb-3 p-3 rounded-xl border-[1.5px] border-orange bg-orange-light">
        <div className="text-[12.5px] font-black text-orange">🔒 参加者にはまだ見えていません</div>
        <div className="text-[11px] text-sub leading-relaxed mt-0.5 mb-2">
          組み分けと配車は、整えてから「公開する」を押すと参加者に見えるようになります（公開時に参加者へ通知が届きます）。
        </div>
        <button type="button" onClick={() => set(true)} disabled={busy}
          className="w-full py-2.5 rounded-xl bg-orange text-white text-[13px] font-black disabled:opacity-50">
          {busy ? '…' : '📣 参加者に公開する'}
        </button>
      </div>
    );
  }
  return (
    <div className="mb-3 p-2.5 rounded-xl border border-green bg-green-light flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-black text-green">👀 参加者に公開中</div>
        <div className="text-[10.5px] text-sub leading-snug">編集した内容はそのまま参加者に反映されます。整え直す間だけ隠すなら「非公開に戻す」。</div>
      </div>
      {round.assignmentsPublished === true && (
        <button type="button" onClick={() => set(false)} disabled={busy}
          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-sub disabled:opacity-50">
          非公開に戻す
        </button>
      )}
      {round.assignmentsPublished === undefined && (
        <button type="button" onClick={() => set(false)} disabled={busy}
          className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-sub disabled:opacity-50">
          非公開にする
        </button>
      )}
    </div>
  );
}
