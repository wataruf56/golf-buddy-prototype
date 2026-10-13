'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/components/Toast';
import { confirmDialog } from '@/components/ConfirmDialog';
import { track } from '@/lib/telemetry';

// 友達解除のボタン（2026-10-14）。プロフィールの下と、DM画面の上に置く。
// ゴル友（QR・友達申請）か、レビューで相互に「行きたい／💘」の相手のときだけ出る（GET /api/friends/unfriend）。
// 相互マッチ（同じ組で回ってお互いに行きたい／💘）の相手は「思わない」と同じ扱いで★に反映。QR・友達申請だけの相手は
// 一緒に回っていないので★に影響しない（サーバー側で分ける）。どちらも相手には通知しない。
export function UnfriendButton({ otherId, otherName, compact, onDone }: {
  otherId: string;
  otherName: string;
  compact?: boolean;          // DM画面の上（小さい文字ボタン）
  onDone?: () => void;
}) {
  const [can, setCan] = useState(false);
  const [matched, setMatched] = useState(false);   // 相互マッチの相手（解除すると★に反映される）
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCan(false);
    if (!otherId) return;
    fetch(`/api/friends/unfriend?userId=${encodeURIComponent(otherId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) { setCan(!!d?.canUnfriend); setMatched(!!d?.matched); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [otherId]);

  if (!can) return null;

  async function run() {
    if (busy) return;
    const ok = await confirmDialog({
      title: `${otherName}さんとの友達を解除しますか？`,
      message: (matched ? [
        '・ゴル友の友達リストから外れます',
        '・お互いにメッセージ（DM）を送れなくなります',
        '・「またこの人とラウンドを回りたい？」に「思わない」と答えたのと同じ扱いになり、相手の評価に反映されます',
        '・相手には通知されません',
      ] : [
        '・ゴル友の友達リストから外れます',
        '・お互いにメッセージ（DM）を送れなくなります',
        '・一緒にラウンドしていないので、評価には影響しません',
        '・相手には通知されません（また QR コードを読み合えば、つながり直せます）',
      ]).join('\n'),
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
