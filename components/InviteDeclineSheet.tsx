'use client';

import { useState } from 'react';
import { Portal } from '@/components/Portal';
import { DECLINE_REASONS } from '@/lib/inviteStatus';

// 招待への「行けない」の確認（2026-10-13）。募集ページの 💌 バナーとホームの招待カードで共通。
// 理由は任意（押さなくても「行けないと伝える」で返事できる）。文言は「行けない」で、「拒否」とは書かない。
// 返事すると招待した人（主催者／運営）にアプリ内のお知らせが届く（LINEは送らない）。
export function InviteDeclineSheet({
  title, inviterName, onClose, onDecline,
}: {
  title: string;
  /** 招待した人の呼び方（「〇〇さん」「ゴルトモ運営」） */
  inviterName: string;
  onClose: () => void;
  onDecline: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try { await onDecline(reason || undefined); } finally { setBusy(false); }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[300] bg-black/50 flex items-center justify-center p-6 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }}>
        <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-card w-full max-w-[340px] shadow-lg overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="text-base font-black mb-1.5 text-center">今回は行けないと伝えますか？</div>
            <div className="text-[12.5px] text-sub leading-relaxed text-center mb-3">
              「{title}」の招待に、{inviterName}へ「行けない」とお返事します。<br />
              お知らせはアプリ内だけで、LINEは送られません。
            </div>
            <div className="text-[11px] font-bold text-sub mb-1.5">ひとこと添える（任意）</div>
            <div className="flex flex-wrap gap-1.5">
              {DECLINE_REASONS.map((r) => {
                const on = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(on ? '' : r)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold border-[1.5px] ${on ? 'bg-green text-white border-green' : 'bg-bg text-sub border-border'}`}
                  >{r}</button>
                );
              })}
            </div>
          </div>
          <div className="flex border-t border-border">
            <button onClick={onClose} disabled={busy} className="flex-1 py-3.5 text-sm font-bold text-sub border-r border-border">やめる</button>
            <button onClick={submit} disabled={busy} className="flex-1 py-3.5 text-sm font-black text-orange">
              {busy ? '送信中...' : '行けないと伝える'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
