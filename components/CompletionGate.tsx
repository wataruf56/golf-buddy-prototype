'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useStore, getMe, store } from '@/lib/store';
import { toast } from '@/components/Toast';

// JST の YYYY-MM-DD。日付の比較は文字列のままで正しく並ぶ。
function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 開催日を1日過ぎても「完了」にされていない募集を、主催者に片付けてもらうためのゲート。
//
// 完了にしないと参加者へレビュー依頼が飛ばず、★（また回りたい率）も貯まらない。
// 放置されると実績データ全体が歪むので、閉じられないモーダルで他の操作を止める。
//
// 出す条件（すべて満たすとき）
//   ・自分が募集した人（hostId が自分）
//   ・開催日が決まっていて、その日を過ぎている（date < 今日）
//   ・まだ completed になっていない
//   ・「まだ」で3日間の見送り（completionSnoozedUntil）をしていない
// 当該ラウンドのページとその配下（編集・チャット等）では出さない。
// 以前は編集ページも塞いでいて、「まだ」と答えた主催者が知り合い枠を直せなかった。
export function CompletionGate() {
  const [busy, setBusy] = useState(false);
  const me = useStore(getMe);
  const rounds = useStore((s) => s.rounds);
  const pathname = usePathname();
  if (!me) return null;

  const today = jstToday();
  // 何件もあるときは、いちばん古いものから片付けてもらう。
  const now = Date.now();
  const overdue = rounds
    .filter((r) => r.hostId === me.id && r.status !== 'completed' && !!r.date && r.date < today)
    .filter((r) => !((r as any).completionSnoozedUntil > now))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const target = overdue[0];
  if (!target) return null;
  if (pathname === `/round/${target.id}` || pathname.startsWith(`/round/${target.id}/`)) return null;

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
          必ず完了させてください。それまで他の操作はできません。
        </p>
        <Link
          href={`/round/${target.id}`}
          className="block w-full py-3 bg-green text-white rounded-xl font-bold text-sm"
        >
          {isDrink ? '飲み会を完了する' : 'ラウンドを完了する'}
        </Link>
        <button
          type="button" disabled={busy}
          onClick={async () => {
            setBusy(true);
            try { await store.snoozeCompletion(target.id); toast('3日間は出しません'); }
            catch (e) { toast('失敗: ' + (e as Error).message, 'error'); }
            finally { setBusy(false); }
          }}
          className="block w-full mt-2 py-2.5 bg-card border border-border text-sub rounded-xl font-bold text-[13px] disabled:opacity-50"
        >
          まだ（3日間は出さない）
        </button>
        {rest > 0 && (
          <div className="text-[11px] text-muted mt-3">ほかにも未完了が {rest} 件あります</div>
        )}
      </div>
    </div>
  );
}
