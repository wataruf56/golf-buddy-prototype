'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore, getMe, store } from '@/lib/store';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { paymentInfoOf, paymentSig, fmtJstDateTime, mdOf, ON_SITE_NOTE } from '@/lib/paymentNotice';

// すでに参加している募集に、主催者があとから事前入金を設定したときの確認（2026-10-11）。
//   「はい」… そのまま参加（確認の印を付ける・/api/rounds/[id]/payment-ack）
//   「いいえ」… 「参加の取り消しをしますか？」→ はい＝参加を取りやめる／いいえ＝この画面ではいったん閉じる（次に開いたときにまた出す）
// 出す相手：承認済みの参加者（主催者・共同主催は除く）・開催前・確認の印がいまの条件（金額・期日）と違う。
// 主催者が金額や期日を変えたら、もう一度出る。
export function PaymentAckGate({ blocked }: { blocked: boolean }) {
  const me = useStore(getMe);
  const meId = useStore((s) => s.meId);
  const rounds = useStore((s) => s.rounds);
  const router = useRouter();
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  if (!me || !meId || meId === 'me' || blocked) return null;

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const target = rounds.find((r) => {
    if (skipped[r.id]) return false;
    if (r.status === 'completed' || (r as any).heldCancelledAt) return false;
    if (r.date && r.date < today) return false;
    if (r.hostId === meId || (r.coHostIds || []).includes(meId)) return false;
    if (!(r.applicantIds || []).includes(meId)) return false;
    const sig = paymentSig(r as any);
    if (!sig) return false;
    return ((r as any).paymentAcks || {})[meId] !== sig;
  });
  if (!target) return null;
  const pi = paymentInfoOf(target as any)!;
  const md = mdOf(target.date);

  async function yes() {
    setBusy(true);
    try {
      const res = await fetch(`/api/rounds/${target!.id}/payment-ack`, { method: 'POST', cache: 'no-store', credentials: 'include' });
      if (!res.ok) throw new Error(String(res.status));
      await store.refreshRounds();
    } catch { toast('保存に失敗しました。もう一度お試しください', 'error'); }
    finally { setBusy(false); }
  }
  async function no() {
    if (!(await confirmDialog({ title: '参加の取り消し', message: `${md ? `${md}の` : ''}「${target!.title}」への参加を取り消しますか？`, confirmText: 'はい（取り消す）', cancelText: 'いいえ', danger: true }))) {
      setSkipped((s) => ({ ...s, [target!.id]: true }));
      return;
    }
    setBusy(true);
    try {
      await store.leaveRound(target!.id, { reason: 'other', text: '事前入金の条件が合わないため' });
      toast('参加を取り消しました');
      setSkipped((s) => ({ ...s, [target!.id]: true }));
    } catch (e) {
      // キャンセル期日を過ぎているなどで取り消せないとき
      toast((e as Error).message || '取り消せませんでした。主催者にご連絡ください', 'error');
      setSkipped((s) => ({ ...s, [target!.id]: true }));
      router.push(`/round/${target!.id}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="absolute inset-0 z-[180] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-card rounded-card max-w-[360px] w-full p-5 shadow-lg border-2 border-border">
        <div className="text-3xl text-center mb-1">💴</div>
        <h3 className="text-[16px] font-black text-center leading-snug mb-2">事前入金のご確認</h3>
        <p className="text-[13px] leading-relaxed mb-2">
          {md ? `${md}の` : ''}「{target.title}」にすでに参加済みですが、こちらのラウンドは<b>指定の口座まで事前入金（プレーフィーのみ）</b>をして参加する必要があります。
        </p>
        <div className="bg-bg rounded-xl p-3 text-[12.5px] leading-relaxed mb-2">
          {!!pi.amount && <div><span className="text-sub font-bold">金額：</span><b>{pi.amount.toLocaleString('ja-JP')}円</b></div>}
          {!!pi.deadline && <div><span className="text-sub font-bold">入金期日：</span><b>{fmtJstDateTime(pi.deadline)}</b></div>}
          {pi.account && <div><span className="text-sub font-bold">振込先：</span><span className="whitespace-pre-wrap">{pi.account}</span></div>}
        </div>
        <p className="text-[11px] text-sub leading-relaxed mb-3">※ {ON_SITE_NOTE}</p>
        <p className="text-[14px] font-black text-center mb-3">問題ないですか？</p>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={no}
            className="flex-1 py-3 bg-card text-sub border-[1.5px] border-border rounded-xl font-bold text-sm disabled:opacity-50">いいえ</button>
          <button type="button" disabled={busy} onClick={yes}
            className="flex-1 py-3 bg-green text-white rounded-xl font-bold text-sm disabled:opacity-50">はい</button>
        </div>
      </div>
    </div>
  );
}
