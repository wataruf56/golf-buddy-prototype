'use client';

import { useEffect, useState } from 'react';
import { CURRENT_BUILD, fetchLatestVersion, forceUpdate } from '@/lib/appUpdate';

// Prominent in-content update notice for the home screen. Each client knows the
// build it was loaded from (CURRENT_BUILD, baked at build time); it polls
// /api/version for the live build and, if they differ, shows a clear card with
// an update button. Tapping it clears caches and reloads to the latest build —
// no app/LINE restart needed. Renders nothing when already up to date.
export function HomeUpdateCard() {
  const [latest, setLatest] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => {
      if (CURRENT_BUILD === 'dev') return;
      fetchLatestVersion().then((v) => { if (v) setLatest(v); });
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(check, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(iv);
    };
  }, []);

  const updateAvailable =
    CURRENT_BUILD !== 'dev' && !!latest && latest !== 'dev' && latest !== CURRENT_BUILD;
  if (!updateAvailable) return null;

  async function onClick() {
    setBusy(true);
    await forceUpdate(latest);
  }

  return (
    <div className="px-5 pb-3">
      <div className="bg-green-light border-2 border-green rounded-card p-3.5 flex items-center gap-3">
        <span className="text-xl">🎉</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-black text-green">新しいバージョンがあります</div>
          <div className="text-[11px] text-sub mt-0.5">最新の機能・修正を反映するには更新してください</div>
        </div>
        <button
          onClick={onClick}
          disabled={busy}
          className="px-3.5 py-1.5 bg-green text-white text-xs font-bold rounded-full whitespace-nowrap disabled:opacity-60"
        >
          {busy ? '更新中…' : '更新する'}
        </button>
      </div>
    </div>
  );
}
