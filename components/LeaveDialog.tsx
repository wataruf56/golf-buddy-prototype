'use client';

import { useState } from 'react';
import { LEAVE_REASONS, type LeaveReasonKey } from '@/lib/leaveReasons';

/**
 * 参加を取りやめるときの確認。
 *
 * 流れ：理由を選ぶ（「その他」は自由入力）→ キャンセル規約の確認に「はい」→ 確定。
 * 主催者と共同管理者には、名前と理由がそのまま届く。本人にもそう書いておく
 * （黙って伝えると、あとで「知らなかった」になるため）。
 */
export function LeaveDialog({ roundTitle, busy, onConfirm, onClose }: {
  roundTitle: string;
  busy?: boolean;
  onConfirm: (reason: LeaveReasonKey, text: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<LeaveReasonKey | ''>('');
  const [text, setText] = useState('');
  const [policyOk, setPolicyOk] = useState(false);

  const needText = reason === 'other';
  const ready = !!reason && (!needText || text.trim().length > 0) && policyOk;

  return (
    <div className="fixed inset-0 bg-black/45 z-[150] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-card shadow-card w-full max-w-[400px] p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="text-[16px] font-black">参加を取りやめますか？</div>
        <div className="text-[12px] font-bold text-sub mt-1 truncate">「{roundTitle}」</div>

        <div className="text-[13px] font-black mt-4">辞退理由は何ですか？</div>
        <div className="mt-2 space-y-1.5">
          {LEAVE_REASONS.map((r) => (
            <label key={r.key}
              className={'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 cursor-pointer text-[13px] font-bold '
                + (reason === r.key ? 'border-orange bg-orange-light' : 'border-border bg-white')}>
              <input type="radio" name="leave-reason" value={r.key} checked={reason === r.key}
                onChange={() => setReason(r.key)} className="accent-[#E8643C]" />
              {r.label}
            </label>
          ))}
        </div>
        {needText && (
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 300))}
            placeholder="理由を入力してください（主催者に伝わります）" rows={3}
            className="w-full mt-2 border-2 border-border rounded-xl px-3 py-2 text-[13px] font-bold bg-white outline-none" />
        )}

        <div className="mt-4 bg-yellow-light border-2 border-yellow rounded-xl px-3 py-2.5">
          <div className="text-[13px] font-black">キャンセル規約等は大丈夫ですか？</div>
          <div className="text-[11px] font-bold text-sub mt-0.5 leading-relaxed">
            ゴルフ場のキャンセル料や、主催者との取り決めを確認してから進めてください。
          </div>
          <label className="flex items-center gap-2 mt-2 text-[13px] font-black cursor-pointer">
            <input type="checkbox" checked={policyOk} onChange={(e) => setPolicyOk(e.target.checked)} className="accent-[#2A8C82] w-4 h-4" />
            はい、確認しました
          </label>
        </div>

        <div className="text-[11px] font-bold text-muted mt-3 leading-relaxed">
          主催者と共同管理者に、あなたの名前と理由がお知らせされます。他の参加者には伝わりません。
        </div>

        <button disabled={!ready || busy} onClick={() => reason && onConfirm(reason, text.trim())}
          className="w-full mt-3 py-3.5 rounded-xl text-[15px] font-black bg-red text-white disabled:opacity-40">
          {busy ? '送信中…' : '参加を取りやめる'}
        </button>
        <button onClick={onClose} disabled={busy}
          className="w-full mt-2 py-3 rounded-xl text-[14px] font-black bg-card text-sub border-2 border-border">
          やめておく
        </button>
      </div>
    </div>
  );
}
