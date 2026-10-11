'use client';

import type { Round } from '@/lib/types';
import { paymentInfoOf, fmtJstDateTime, ON_SITE_NOTE } from '@/lib/paymentNotice';

// 募集ページの「事前入金」の案内（2026-10-11）。入金設定（金額・期日・振込先）があるときだけ出す。
// 振込先は参加している人にだけ届く（lib/roundView.stripPaymentForViewer）。届いていない人には「参加すると表示」。
export function PaymentNoticeCard({ round }: { round: Round }) {
  const pi = paymentInfoOf(round as any);
  if (!pi) return null;
  const when = pi.deadline ? `${fmtJstDateTime(pi.deadline)}までに、` : '';
  const yen = pi.amount ? `${pi.amount.toLocaleString('ja-JP')}円` : '参加費';
  return (
    <div className="mb-4 rounded-xl p-3 border-[1.5px] border-orange bg-orange-light">
      <div className="text-[11px] text-orange font-black mb-1">💴 事前入金制（プレーフィーのみ）</div>
      <div className="text-[13px] font-bold text-text leading-relaxed">
        {when}下記の口座に{yen}振り込んでください。ラウンド募集者が当日まとめてゴルフ場に支払います。
      </div>
      <div className="text-[12px] mt-1.5 leading-relaxed">
        <span className="text-sub font-bold">振込先：</span>
        {pi.account ? <span className="whitespace-pre-wrap font-bold">{pi.account}</span>
          : <span className="text-sub">参加が確定すると表示されます</span>}
      </div>
      <div className="text-[11.5px] text-sub mt-1.5 leading-relaxed">※ {ON_SITE_NOTE}</div>
    </div>
  );
}
