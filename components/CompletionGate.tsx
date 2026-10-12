'use client';

import { usePathname, useRouter } from 'next/navigation';
import { confirmDialog } from '@/components/ConfirmDialog';
import { useState } from 'react';
import { useStore, getMe, store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { completionDueMs } from '@/lib/completionTiming';
import { usePopupSlot, POPUP_PRIORITY, popupEvent } from '@/lib/popupSlot';

// 開催日を1日過ぎても「完了」にされていない募集を、主催者に片付けてもらうためのゲート。
//
// 完了にしないと参加者へレビュー依頼が飛ばず、★（また回りたい率）も貯まらない。
// 放置されると実績データ全体が歪むので、閉じられないモーダルで他の操作を止める。
//
// 出す条件（すべて満たすとき）
//   ・自分が募集した人（hostId が自分）
//   ・完了確認の時刻を過ぎている（開催日の20:00 JST。14時以降スタートなら翌日の20:00）。
//     主催者への LINE と同じ時刻（lib/completionTiming）。2026-10-11 までは「開催日の翌日から」だった
//   ・まだ completed になっていない
//   ・「中止」（heldCancelledAt）を選んでいない（2026-10-11：「まだ」の見送りは廃止）
// 当該ラウンドの詳細ページ（/round/<id>）だけは出さない（完了・中止のボタンがある）。
// 2026-10-11：チャット・編集など配下のページも塞ぐ（どちらかを押すまで他の画面に行けない）。
export function CompletionGate() {
  const [busy, setBusy] = useState(false);
  const me = useStore(getMe);
  const rounds = useStore((s) => s.rounds);
  const pathname = usePathname();
  const router = useRouter();
  const now = Date.now();
  // 何件もあるときは、いちばん古いものから片付けてもらう。
  const overdue = !me ? [] : rounds
    // 2026-10-11：「完了」か「中止」を選ぶまで出す（「まだ」の見送りはやめた）
    .filter((r) => r.hostId === me!.id && r.status !== 'completed' && !(r as any).heldCancelledAt && !!r.date && (completionDueMs(r.date, r.startTime || '') ?? Infinity) <= now)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const target = overdue[0];
  const want = !!target && pathname !== `/round/${target.id}`;
  // ポップアップは同時に1つだけ（lib/popupSlot）。hook は早期 return より前に
  const active = usePopupSlot('completion', POPUP_PRIORITY.completion, want);
  if (!target || !active) return null;

  const isDrink = (target as any).eventType === 'drink';
  const rest = overdue.length - 1;

  return (
    <div className="absolute inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-card max-w-[360px] w-full p-6 shadow-lg text-center">
        <div className="text-4xl mb-2">⚠️</div>
        <h3 className="text-lg font-black mb-2">
          {isDrink ? '飲み会が未完了です' : 'ラウンドが未完了です'}
        </h3>
        <p className="text-[13px] text-sub leading-relaxed mb-2">
          「{target.title}」（{target.date}）が終わったまま、完了になっていません。
        </p>
        <p className="text-[13px] text-red-600 font-bold leading-relaxed mb-4">
          完了にしないと参加者にレビュー依頼が届かず、評価が記録されません。<br />
          「完了」か「中止」を選ぶまで、他の操作はできません。
        </p>
        <p className="text-[12px] text-sub mb-3">実施したなら「完了」、雨天などで実施しなかったなら「中止」を選んでください。</p>
        <div className="flex gap-2">
          <button
            type="button" disabled={busy}
            onClick={async () => {
              if (!(await confirmDialog(isDrink ? '飲み会を完了にしますか？' : 'ラウンドを完了にしますか？（参加者全員にレビュー依頼が送られます）'))) return;
              setBusy(true);
              try { await store.completeRound(target.id); popupEvent('completion', 'complete'); toast(isDrink ? '飲み会を完了しました' : 'ラウンドを完了しました'); }
              catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
              finally { setBusy(false); }
            }}
            className="flex-1 py-3 bg-green text-white rounded-xl font-bold text-sm disabled:opacity-50"
          >{isDrink ? '飲み会完了' : 'ラウンド完了'}</button>
          <button
            type="button" disabled={busy}
            onClick={async () => {
              if (!(await confirmDialog(isDrink ? 'この飲み会を「中止」にしますか？' : 'このラウンドを「中止」にしますか？（雨天などで実施しなかったとき。レビュー依頼は送られません）'))) return;
              setBusy(true);
              try { await store.cancelHeldRound(target.id); popupEvent('completion', 'held_cancel'); toast('中止にしました'); }
              catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
              finally { setBusy(false); }
            }}
            className="flex-1 py-3 bg-card text-sub border-[1.5px] border-border rounded-xl font-bold text-sm disabled:opacity-50"
          >{isDrink ? '飲み会中止' : 'ラウンド中止'}</button>
        </div>
        <button type="button" onClick={() => { popupEvent('completion', 'open_round'); router.push(`/round/${target.id}`); }} className="block w-full mt-2 py-2 text-[12px] text-blue font-bold">募集ページを確認する</button>
        {rest > 0 && (
          <div className="text-[11px] text-muted mt-3">ほかにも未完了が {rest} 件あります</div>
        )}
      </div>
    </div>
  );
}
