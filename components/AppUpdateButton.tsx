'use client';

import { useEffect, useState } from 'react';
import { CURRENT_BUILD, fetchLatestVersion, forceUpdate } from '@/lib/appUpdate';

// Always-available "update the app" button (mypage). Unlike the auto banner —
// which only appears when a newer build exists — this is always visible so the
// user can force a refresh / cache clear any time. Shows whether they're
// already on the latest build.
export function AppUpdateButton() {
  const [latest, setLatest] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchLatestVersion().then((v) => { if (v) setLatest(v); });
  }, []);

  const known = CURRENT_BUILD !== 'dev' && !!latest && latest !== 'dev';
  const upToDate = known && latest === CURRENT_BUILD;
  const updateAvailable = known && latest !== CURRENT_BUILD;

  async function onClick() {
    setBusy(true);
    await forceUpdate(latest || undefined);
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full bg-card rounded-xl px-4 py-3.5 mb-1.5 flex justify-between items-center shadow-card text-left disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="text-sm font-medium">🔄 アプリを最新に更新</span>
        <span className="block text-[10px] text-muted mt-0.5">
          {busy
            ? '更新中…'
            : updateAvailable
              ? '🟢 新しいバージョンがあります — タップで更新'
              : upToDate
                ? `最新の状態です（${CURRENT_BUILD}）`
                : 'タップして最新の状態に更新'}
        </span>
      </span>
      <span className="text-muted">›</span>
    </button>
  );
}
