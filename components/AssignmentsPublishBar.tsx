'use client';

import { useState } from 'react';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { Round } from '@/lib/types';

// 組み分け・配車は、主催者が「公開する」を押すまで参加者に見えない（2026-10-06 本人要望）。
// 2026-10-08：組み分け（target='groups'）と配車（target='cars'）で公開ボタンを分けた。
// 旧データ：組み分けは assignmentsPublished 未設定＝公開扱い。配車は carsPublished 未設定なら組み分けに従う。
export function AssignmentsPublishBar({ round, target }: { round: Round; target: 'groups' | 'cars' }) {
  const [busy, setBusy] = useState(false);
  const isCars = target === 'cars';
  const flag = isCars ? (round.carsPublished ?? (round.assignmentsPublished !== false ? undefined : false)) : round.assignmentsPublished;
  const published = isCars ? (round.carsPublished ?? (round.assignmentsPublished !== false)) : round.assignmentsPublished !== false;
  const label = isCars ? '配車（ピックアップ）' : '組み分け';
  const tab = isCars ? '「ピックアップ」タブ' : '「組み分け」タブ';

  async function set(next: boolean) {
    if (busy) return;
    if (next && !(await confirmDialog(`${label}を参加者に公開しますか？\n公開すると参加者に通知が届き、${tab}で見られるようになります。`))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${round.id}/publish-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: next, target }), cache: 'no-store', credentials: 'include',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await store.refreshRounds();
      toast(next ? `${label}を参加者に公開しました（通知を送りました）` : `${label}を非公開に戻しました（主催者だけに見えます）`);
    } catch (e) {
      toast('切り替えに失敗しました: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const hasContent = isCars
    ? (round.carAssignments?.length || 0) > 0
    : (round.groups?.length || 0) + (round.groupsBack?.length || 0) > 0;
  if (!published && !hasContent) {
    return (
      <div className="mb-3 px-3 py-2 rounded-xl bg-bg text-[11px] text-sub leading-relaxed">
        🔒 {label}は、作ったあとに「参加者に公開する」を押すまで参加者には見えません。
      </div>
    );
  }
  if (!published) {
    return (
      <div className="mb-3 p-3 rounded-xl border-[1.5px] border-orange bg-orange-light">
        <div className="text-[12.5px] font-black text-orange">🔒 {label}は参加者にまだ見えていません</div>
        <div className="text-[11px] text-sub leading-relaxed mt-0.5 mb-2">
          整えてから「公開する」を押すと参加者に見えるようになります（公開時に参加者へ通知が届きます）。{isCars ? '組み分けの公開とは別です。' : '配車（ピックアップ）の公開とは別です。'}
        </div>
        <button type="button" onClick={() => set(true)} disabled={busy}
          className="w-full py-2.5 rounded-xl bg-orange text-white text-[13px] font-black disabled:opacity-50">
          {busy ? '…' : `📣 ${label}を参加者に公開する`}
        </button>
      </div>
    );
  }
  return (
    <div className="mb-3 p-2.5 rounded-xl border border-green bg-green-light flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-black text-green">👀 {label}を参加者に公開中</div>
        <div className="text-[10.5px] text-sub leading-snug">編集した内容はそのまま参加者に反映されます。整え直す間だけ隠すなら「非公開に戻す」。</div>
      </div>
      <button type="button" onClick={() => set(false)} disabled={busy}
        className="flex-shrink-0 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-bold text-sub disabled:opacity-50">
        {flag === undefined ? '非公開にする' : '非公開に戻す'}
      </button>
    </div>
  );
}
