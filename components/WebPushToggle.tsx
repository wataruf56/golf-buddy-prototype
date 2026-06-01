'use client';

import { useEffect, useState } from 'react';
import { enableWebPush, disableWebPush, pushSupported, pushPermission } from '@/lib/webPushClient';
import { toast } from '@/components/Toast';

// A settings row that lets the user turn on browser/web push notifications.
// Works independently of LINE notifications — this delivers to the device's
// lock screen even for users who never added the LINE official account
// (as long as they've added ゴルトモ to their home screen / allowed
// notifications). iOS requires the PWA to be installed to home screen first.
export function WebPushToggle() {
  const [state, setState] = useState<'unknown' | 'unsupported' | 'on' | 'off' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) { setState('unsupported'); return; }
    const perm = pushPermission();
    if (perm === 'denied') { setState('denied'); return; }
    // Check if we already have an active subscription.
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const sub = reg && (await reg.pushManager.getSubscription());
        setState(sub && perm === 'granted' ? 'on' : 'off');
      } catch { setState('off'); }
    })();
  }, []);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (state === 'on') {
        await disableWebPush();
        setState('off');
        toast('プッシュ通知をオフにしました');
      } else {
        const r = await enableWebPush();
        if (r.ok) {
          setState('on');
          toast('プッシュ通知をオンにしました');
        } else if (r.reason === 'denied') {
          setState('denied');
          toast('通知がブロックされています。ブラウザの設定から許可してください', 'error');
        } else if (r.reason === 'unsupported') {
          setState('unsupported');
          toast('この端末/ブラウザは未対応です', 'error');
        } else {
          toast('有効化に失敗しました' + (r.message ? `: ${r.message}` : ''), 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === 'unsupported') {
    return (
      <div className="w-full bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card opacity-60">
        <div>
          <div className="text-sm font-medium">プッシュ通知（端末）</div>
          <div className="text-[10px] text-muted mt-0.5">この端末では利用できません</div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bg text-muted">—</span>
      </div>
    );
  }

  const isOn = state === 'on';
  return (
    <button
      onClick={toggle}
      disabled={busy || state === 'unknown'}
      className="w-full bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card text-left disabled:opacity-50"
    >
      <div>
        <div className="text-sm font-medium">プッシュ通知（端末）</div>
        <div className="text-[10px] text-muted mt-0.5">
          {state === 'denied'
            ? 'ブロック中 — ブラウザ設定で許可してください'
            : 'ロック画面に通知が届きます（LINE追加なしでOK）'}
        </div>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isOn ? 'bg-green-light text-green' : 'bg-bg text-muted'}`}>
        {busy ? '...' : isOn ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}
