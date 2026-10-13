'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { track } from '@/lib/telemetry';

// 友達解除のボタン（2026-10-14）。プロフィールの下と、DM画面の上に置く。
// ゴル友（QR・友達申請）か、レビューで相互に「行きたい／💘」の相手のときだけ出る（GET /api/friends/unfriend）。
// 解除は「またその人とラウンドを回りたいか」に「思わない」と答えたのと同じ扱い（サーバー側で処理）。相手には通知しない。
export function UnfriendButton({ otherId, otherName, compact, onDone }: {
  otherId: string;
  otherName: string;
  compact?: boolean;          // DM画面の上（小さい文字ボタン）
  onDone?: () => void;
}) {
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCan(false);
    if (!otherId) return;
    fetch(`/api/friends/unfriend?userId=${encodeURIComponent(otherId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setCan(!!d?.canUnfriend); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [otherId]);

  if (!can) return null;

  async function run() {
    if (busy) return;
    const ok = await confirmDialog({
      title: `${otherName}さんとの友達を解除しますか？`,
      message: [
        '・ゴル友の友達リストから外れます',
        '・お互いにメッセージ（DM）を送れなくなります',
        '・「またこの人とラウンドを回りたい？」に「思わない」と答えたのと同じ扱いになり、相手の評価に反映されます',
        '・相手には通知されません',
      ].join('\n'),
      confirmText: '友達解除する',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/friends/unfriend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: otherId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || `${r.status}`);
      track('unfriend', { targetId: otherId });
      toast('友達を解除しました');
      setCan(false);
      try { const { store } = await import('@/lib/store'); await store.refreshMe(); } catch { /* noop */ }
      onDone?.();
    } catch (e) {
      toast('解除できませんでした: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button type="button" onClick={run} disabled={busy}
        className="flex-shrink-0 px-2.5 py-1.5 rounded-full border-[1.5px] border-border text-[11px] font-black text-sub bg-bg disabled:opacity-50">
        友達解除
      </button>
    );
  }
  return (
    <button type="button" onClick={run} disabled={busy}
      className="mt-2.5 w-full py-3 rounded-xl border-[1.5px] border-border bg-card text-[13px] font-black text-sub disabled:opacity-50">
      👋 {otherName}さんとの友達を解除する
    </button>
  );
}
