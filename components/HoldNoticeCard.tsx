'use client';

import { useState } from 'react';
import { store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Linkify } from '@/components/Linkify';
import type { RoundHold } from '@/lib/types';
import { fmtHoldDeadline } from '@/lib/roundHold';

// 申請した人に出す「⏸ 主催者からのお知らせ（保留中）」（2026-10-13・lib/roundHold）。
// 募集ページの中に置くカード（ポップアップにはしない＝ほかの閉じられないポップアップと重ならない）。
// 「待ちますか？」は答えるまで出し続ける。
//   ⏳ 待つ   … 答えを記録（主催者の一覧に「⏳「待つ」と回答」）
//   待てない … 確認してから、この募集への参加申請を取り消す（主催者にはアプリ内のお知らせだけ）
export function HoldNoticeCard({ roundId, hold, onChanged }: {
  roundId: string;
  hold: RoundHold;
  /** 答えを送ったあと（ストアに無い募集を開いているときの取り直しなど） */
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<'' | 'wait' | 'cant'>('');
  const [err, setErr] = useState('');
  const label = fmtHoldDeadline(hold.until);
  const past = hold.until <= Date.now();

  async function answer(a: 'wait' | 'cant') {
    if (busy) return;
    if (a === 'cant') {
      const ok = await confirmDialog({
        title: '参加申請を取り消しますか？',
        message: '「待てない」を選ぶと、この募集への参加申請を取り消します。\n主催者にはアプリ内でお知らせします（LINEは送られません）。',
        confirmText: '取り消す', cancelText: 'やめる', danger: true,
      });
      if (!ok) return;
    }
    setBusy(a); setErr('');
    try {
      await store.answerHold(roundId, a);
      if (a === 'cant') {
        toast('参加申請を取り消しました。主催者にはアプリ内でお知らせしました。');
      } else {
        toast('「待つ」と伝えました');
      }
      onChanged?.();
    } catch (e) {
      setErr((e as Error).message || '送信できませんでした。もう一度お試しください');
      // 主催者がもう承認・見送りしていた、など。いまの状態に合わせる
      store.refreshRounds().catch(() => {});
      onChanged?.();
    } finally { setBusy(''); }
  }

  return (
    <div className="mb-4">
      <div className="rounded-[14px] p-3" style={{ background: '#FBF0D6', border: '2px solid #E8A93C' }}>
        <div className="text-[14px] font-black mb-1">⏸ 主催者からのお知らせ（保留中）</div>
        <div className="text-[12.5px] leading-relaxed">主催者は <b>{label}まで</b> にお返事します。</div>
        {!!hold.message && (
          <div className="mt-1.5 bg-white rounded-[10px] px-2.5 py-2 text-[12.5px] font-bold leading-relaxed whitespace-pre-wrap" style={{ border: '1.5px dashed #E8A93C' }}>
          「<Linkify text={hold.message} />」
          </div>
        )}
        {past && (
          <div className="text-[11px] text-sub mt-1.5">お返事の日時になりました。まもなく主催者から結果が届きます。</div>
        )}
      </div>
      {hold.answer === 'wait' ? (
        <div className="mt-2 rounded-xl bg-green-light text-green text-[12.5px] font-bold px-3 py-2.5 leading-relaxed">
          ⏳ いまの状態：「待つ」と回答済み。主催者のお返事を待っています（{label}まで）
        </div>
      ) : (
        <>
          <div className="text-[16px] font-black text-center mt-3 mb-2">待ちますか？</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => answer('wait')} disabled={!!busy}
              className="py-3 rounded-xl text-[14px] font-black text-white bg-green border-2 border-green disabled:opacity-50">
              {busy === 'wait' ? '送信中…' : '⏳ 待つ'}
            </button>
            <button type="button" onClick={() => answer('cant')} disabled={!!busy}
              className="py-3 rounded-xl text-[14px] font-black text-text bg-card border-2 border-border disabled:opacity-50">
              {busy === 'cant' ? '取り消し中…' : '待てない'}
            </button>
          </div>
          <div className="text-[10.5px] text-sub text-center mt-1.5 leading-relaxed">
            「待てない」を選ぶと、この募集への参加申請を取り消します（主催者にはアプリ内でお知らせ）
          </div>
        </>
      )}
      {err && <div className="text-[12px] text-red font-bold mt-1.5">⚠️ {err}</div>}
    </div>
  );
}
