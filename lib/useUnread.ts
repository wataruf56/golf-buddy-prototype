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
  const serverSeen = useStore((s) => s.roundChatSeen);
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

  // 1on1 chats（DM）: 未読メッセージの「件数」を合計する（LINEのバッジと同じ考え方）。
  let buddiesUnread = 0;
  for (const c of chats) {
    buddiesUnread += c.unreadCount?.[meId] || 0;
  }

  // Round group chats: my participating rounds with last activity > my lastSeen
  let roundUnread = 0;
  const unreadRoundIds = new Set<string>();
  for (const r of rounds) {
    if (r.hostId !== meId && !(r.applicantIds || []).includes(meId)) continue;
    const lastActivity = activity?.[r.id] || 0;
    if (!lastActivity) continue;
    // 一度でも見たら既読（この端末の記録か、ほかの端末で見た記録＝サーバーの新しい方）（2026-10-12）
    const seen = Math.max(getSeen(r.id), Number(serverSeen?.[r.id]) || 0);
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
