'use client';

import { useEffect, useState } from 'react';
import { useStore } from './store';

const SEEN_KEY_PREFIX = 'gb-seen-round-';

function getSeen(roundId: string): number {
  if (typeof window === 'undefined') return 0;
  try { return Number(localStorage.getItem(SEEN_KEY_PREFIX + roundId) || 0); } catch { return 0; }
}

export function markRoundChatSeen(roundId: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(SEEN_KEY_PREFIX + roundId, String(Date.now())); } catch {}
  // Force a re-render of subscribers via storage event
  window.dispatchEvent(new Event('gb-unread-update'));
}

export function useUnreadCounts() {
  const meId = useStore((s) => s.meId);
  const chats = useStore((s) => s.chats);
  const rounds = useStore((s) => s.rounds);
  const activity = useStore((s) => s.roundChatActivity);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function onUpdate() { setTick((t) => t + 1); }
    window.addEventListener('gb-unread-update', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('gb-unread-update', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  // 1on1 chats: count chats that have unreadCount[meId] > 0
  let buddiesUnread = 0;
  for (const c of chats) {
    if ((c.unreadCount?.[meId] || 0) > 0) buddiesUnread += 1;
  }

  // Round group chats: my participating rounds with last activity > my lastSeen
  let roundUnread = 0;
  const unreadRoundIds = new Set<string>();
  for (const r of rounds) {
    if (r.hostId !== meId && !(r.applicantIds || []).includes(meId)) continue;
    const lastActivity = activity?.[r.id] || 0;
    if (!lastActivity) continue;
    const seen = getSeen(r.id);
    if (lastActivity > seen) {
      roundUnread += 1;
      unreadRoundIds.add(r.id);
    }
  }

  // tick used to recompute when localStorage changes
  void tick;

  return {
    buddiesUnread,
    roundUnread,
    totalUnread: buddiesUnread + roundUnread,
    unreadRoundIds,
  };
}
