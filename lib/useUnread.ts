'use client';

import { useEffect, useState } from 'react';
import { useStore, store } from './store';

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

// 未読件数（①②のバッジ）はサーバーで数える（POST /api/me/round-unread・lib/roundUnread）（2026-10-13）。
// たくさんの部品が同じフックを使うので、読み込みは1か所にまとめ、10秒に1回まで（既読にしたときは即）。
let lastFetchAt = 0;
let inflight = false;
export async function refreshRoundUnread(force = false) {
  if (typeof window === 'undefined' || inflight) return;
  if (!force && Date.now() - lastFetchAt < 10_000) return;
  const s = store.get();
  if (!s.meId || s.meId === 'me') return;
  inflight = true; lastFetchAt = Date.now();
  try {
    const localSeen: Record<string, number> = {};
    for (const r of s.rounds) {
      if (r.hostId !== s.meId && !(r.applicantIds || []).includes(s.meId)) continue;
      const v = getSeen(r.id); if (v) localSeen[r.id] = v;
    }
    const res = await fetch('/api/me/round-unread', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localSeen }), cache: 'no-store', credentials: 'include' });
    if (res.ok) { const j = await res.json(); store.setRoundUnread(j.unread || {}); }
  } catch { /* noop */ } finally { inflight = false; }
}

// DM（1対1）の未読件数を取り直す（下のタブ「ゴル友」のバッジ・2026-10-15）。
// これまでは画面を移ったとき・アプリを開き直したときの bootstrap だけで、同じ画面を開いたままだと
// 届いたDMや「行ける日」の声かけがバッジに出なかった。画面が見えている間だけ45秒ごとに軽いAPIで読む。
let dmFetchAt = 0;
let dmInflight = false;
let dmTimer: ReturnType<typeof setInterval> | null = null;
let dmUsers = 0;
export async function refreshDmUnread(force = false) {
  if (typeof window === 'undefined' || dmInflight) return;
  if (!force && Date.now() - dmFetchAt < 20_000) return;
  if (document.visibilityState !== 'visible') return;
  const s = store.get();
  if (!s.meId || s.meId === 'me') return;
  dmInflight = true; dmFetchAt = Date.now();
  try {
    const res = await fetch('/api/me/dm-unread', { cache: 'no-store', credentials: 'include' });
    if (res.ok) { const j = await res.json(); store.setDmUnread(Array.isArray(j.chats) ? j.chats : []); }
  } catch { /* noop */ } finally { dmInflight = false; }
}

export function useUnreadCounts() {
  // DMの未読は45秒ごと＋画面に戻ったときに読み直す（使う部品が何個あってもタイマーは1つ）
  useEffect(() => {
    dmUsers += 1;
    if (!dmTimer) dmTimer = setInterval(() => { refreshDmUnread(false); }, 45_000);
    const onVis = () => { if (document.visibilityState === 'visible') refreshDmUnread(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      dmUsers -= 1;
      if (dmUsers <= 0 && dmTimer) { clearInterval(dmTimer); dmTimer = null; dmUsers = 0; }
    };
  }, []);
  const meId = useStore((s) => s.meId);
  const chats = useStore((s) => s.chats);
  const rounds = useStore((s) => s.rounds);
  const activity = useStore((s) => s.roundChatActivity);
  const serverSeen = useStore((s) => s.roundChatSeen);
  const counts = useStore((s) => s.roundUnread);
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
  // 新しい動きが来たら（bootstrap の最終投稿時刻が変わったら）件数を読み直す
  const activityKey = Object.values(activity || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  useEffect(() => { refreshRoundUnread(false); }, [activityKey, meId]);

  // 1on1 chats（DM）: 未読メッセージの「件数」を合計する（LINEのバッジと同じ考え方）。
  let buddiesUnread = 0;
  for (const c of chats) {
    buddiesUnread += c.unreadCount?.[meId] || 0;
  }

  // Round group chats: 件数が読めていればそれ（自分の発言は除く）。まだなら最終投稿時刻と既読の比較（件数なし）
  let roundUnread = 0;
  const unreadRoundIds = new Set<string>();
  const countByRound: Record<string, number> = {};
  for (const r of rounds) {
    if (r.hostId !== meId && !(r.applicantIds || []).includes(meId)) continue;
    if (counts) {
      const n = counts[r.id]?.total || 0;
      if (n > 0) { roundUnread += 1; unreadRoundIds.add(r.id); countByRound[r.id] = n; }
      continue;
    }
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
    /** その募集の未読件数（数えられていないときは 0＝バッジは「新着」だけ） */
    countByRound,
  };
}
