'use client';

import { useEffect, useState } from 'react';
import { store, useStore } from './store';

// 下のタブ「行ける日」の①②バッジ（2026-10-14）。
//   ・数はサーバーが数える（bootstrap の availNew・lib/availability.countNewAvailFor）。
//     最後にタブを開いた時刻（users.availSeenAt）より後に、ほかの人が新しく押した日の数
//   ・タブを開いたら markAvailSeen()：その場でバッジを消し、サーバーに「見た」を記録する
//   ・端末にも「見た時刻」を残す（予備）。サーバーへの記録が遅れた・失敗したときや、
//     開いた直後に古い bootstrap が返ってきたときでも、見た分は数えない
const KEY = (meId: string) => `gb-avail-seen-${meId}`;
const EVT = 'gb-avail-seen';

function localSeen(meId: string): number {
  if (typeof window === 'undefined' || !meId) return 0;
  try { return Number(localStorage.getItem(KEY(meId)) || 0); } catch { return 0; }
}

export async function markAvailSeen() {
  if (typeof window === 'undefined') return;
  const meId = store.get().meId;
  if (!meId || meId === 'me') return;
  try { localStorage.setItem(KEY(meId), String(Date.now())); } catch { /* noop */ }
  store.clearAvailNew();
  window.dispatchEvent(new Event(EVT));
  try { await fetch('/api/me/avail-seen', { method: 'POST', credentials: 'include', cache: 'no-store' }); } catch { /* 端末の記録で代わりにする */ }
}

/** タブに出す数（0 なら出さない） */
export function useAvailBadge(): number {
  const meId = useStore((s) => s.meId);
  const availNew = useStore((s) => s.availNew);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(EVT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(EVT, on); window.removeEventListener('storage', on); };
  }, []);
  void tick;
  if (!availNew || !availNew.count) return 0;
  const seen = localSeen(meId);
  if (!seen) return availNew.count;
  const ats = availNew.ats || [];
  const after = ats.filter((t) => t > seen).length;
  // ats は新しい順に最大120件。全部が「見た後」なら、載っていない分もたぶん見た後
  return after === ats.length ? Math.max(after, availNew.count) : after;
}
