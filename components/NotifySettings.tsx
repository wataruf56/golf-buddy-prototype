'use client';

import { useState } from 'react';
import { NOTIFY_TYPES, defaultNotifyPrefs, type NotifyType } from '@/lib/notifyPrefs';
import { getMe, store, useStore } from '@/lib/store';
import { toast } from '@/components/Toast';

// Per-type notification settings. Each row toggles whether that event pings
// the user's LINE official account (and web push). Defaults come from
// NOTIFY_TYPES; the user's saved overrides live in me.notifyPrefs.
export function NotifySettings({ onClose }: { onClose: () => void }) {
  const me = useStore(getMe);
  const base = defaultNotifyPrefs();
  const saved = (me.notifyPrefs || {}) as Partial<Record<NotifyType, boolean>>;
  const initial: Record<NotifyType, boolean> = { ...base };
  for (const t of NOTIFY_TYPES) {
    if (t.key in saved && typeof saved[t.key] === 'boolean') initial[t.key] = !!saved[t.key];
  }
  const [prefs, setPrefs] = useState<Record<NotifyType, boolean>>(initial);
  const [busy, setBusy] = useState(false);
  // Master switch mirrors the legacy notifyOff (inverted).
  const [masterOn, setMasterOn] = useState<boolean>(!me.notifyOff);

  async function save() {
    setBusy(true);
    try {
      await store.updateMe({ notifyPrefs: prefs, notifyOff: !masterOn } as any);
      toast('通知設定を保存しました');
      onClose();
    } catch (e) {
      toast('保存に失敗しました: ' + (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/50 z-[170] flex items-end sm:items-center justify-center p-0 sm:p-5 backdrop-blur-sm">
      <div className="bg-card rounded-t-3xl sm:rounded-card w-full max-w-[420px] max-h-[88vh] overflow-y-auto shadow-lg">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 pt-4 pb-3 border-b border-border z-10">
          <div className="text-base font-black">🔔 通知の設定</div>
          <button onClick={onClose} className="text-muted text-xl leading-none px-1" aria-label="閉じる">×</button>
        </div>

        {/* Master switch */}
        <div className="px-5 pt-3">
          <button
            onClick={() => setMasterOn((v) => !v)}
            className="w-full flex items-center justify-between p-3.5 bg-bg rounded-xl mb-1"
          >
            <div className="text-left">
              <div className="text-sm font-black">すべての通知</div>
              <div className="text-[10px] text-sub mt-0.5">オフにすると下の設定に関係なく一切届きません</div>
            </div>
            <Switch on={masterOn} />
          </button>
        </div>

        {/* Per-type list */}
        <div className={`px-5 pt-2 pb-1 ${masterOn ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="text-[11px] font-bold text-sub px-1 mb-1.5">受け取る通知を選ぶ</div>
          <div className="flex flex-col gap-1.5">
            {NOTIFY_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setPrefs((p) => ({ ...p, [t.key]: !p[t.key] }))}
                className="w-full flex items-center justify-between p-3 bg-bg rounded-xl text-left"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="text-[13px] font-bold">{t.label}</div>
                  <div className="text-[10px] text-sub mt-0.5 leading-relaxed">{t.desc}</div>
                </div>
                <Switch on={prefs[t.key]} />
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 sticky bottom-0 bg-card border-t border-border">
          <button
            onClick={save}
            disabled={busy}
            className="w-full py-3 bg-green text-white rounded-xl text-sm font-bold disabled:opacity-50"
          >
            {busy ? '保存中...' : '保存する'}
          </button>
          <div className="text-[10px] text-muted text-center mt-2">
            通知を受け取るには、ゴルトモ公式アカウントの友だち追加が必要です
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-green' : 'bg-border'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </span>
  );
}
