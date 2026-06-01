'use client';

import { useEffect, useState } from 'react';
import { enableWebPush, disableWebPush, pushSupported, pushPermission } from '@/lib/webPushClient';
import { toast } from '@/components/Toast';

// iOS only exposes PushManager inside an installed (home-screen) PWA. Detect
// "iOS Safari, not yet installed" so we can tell the user exactly what to do
// instead of just greying the row out.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; detect via touch.
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

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
    // On iOS the real reason is almost always "not installed to home screen
    // yet" — guide them there rather than saying "unsupported".
    const iosNeedsInstall = isIOS() && !isStandalone();
    return (
      <div className="w-full bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card">
        <div className="flex-1 min-w-0 pr-2">
          <div className="text-sm font-medium">プッシュ通知（端末）</div>
          <div className="text-[10px] text-muted mt-0.5 leading-relaxed">
            {iosNeedsInstall
              ? 'iPhoneでは「ホーム画面に追加」したアプリから開くと使えます。マイページの「📱 ホーム画面に追加」をご確認ください。'
              : 'この端末／ブラウザでは利用できません'}
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-bg text-muted flex-shrink-0">
          {iosNeedsInstall ? '要設定' : '—'}
        </span>
      </div>
    );
  }

  const isOn = state === 'on';

  async function sendTest() {
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      if (r.ok) toast('テスト通知を送信しました（数秒で届きます）');
      else toast('テスト送信に失敗しました', 'error');
    } catch {
      toast('テスト送信に失敗しました', 'error');
    }
  }

  return (
    <div className="mb-1.5">
      <button
        onClick={toggle}
        disabled={busy || state === 'unknown'}
        className="w-full bg-card rounded-xl px-4 py-3.5 flex justify-between items-center shadow-card text-left disabled:opacity-50"
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
      {isOn && (
        <button
          onClick={sendTest}
          className="w-full mt-1 px-4 py-2 text-[12px] font-bold text-green bg-green-light rounded-lg"
        >
          🔔 テスト通知を送る
        </button>
      )}
    </div>
  );
}
