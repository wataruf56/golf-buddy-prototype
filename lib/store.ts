'use client';

import { useSyncExternalStore } from 'react';
import type { Chat, Message, PendingReview, Review, Round, User, PickupStatus } from './types';

export type AppNotification = {
  id: string;
  type: string;
  text: string;
  link?: string;
  createdAt: number;
};

type Store = {
  hydrated: boolean;
  meId: string;
  users: User[];
  rounds: Round[];
  pendingReviews: PendingReview[];
  chats: Chat[];
  buddyIds: string[];
  roundChatActivity: Record<string, number>;
  banned: boolean;
  // 部分制限フラグ（noCreate / noDM / noChat / noInterest / noReview / noInvite /
  // noApplyAll / applyBlockHostIds）。UIの事前ブロックに使う。
  restrictions: UserRestriction;
  isAdmin: boolean;
  notifications: AppNotification[];
};

export type UserRestriction = {
  noCreate?: boolean;
  noApplyAll?: boolean;
  noInvite?: boolean;
  noChat?: boolean;
  noDM?: boolean;
  noInterest?: boolean;
  noReview?: boolean;
  applyBlockHostIds?: string[];
};

const initial: Store = {
  hydrated: false,
  meId: '',
  users: [],
  rounds: [],
  pendingReviews: [],
  chats: [],
  buddyIds: [],
  roundChatActivity: {},
  banned: false,
  restrictions: {},
  isAdmin: false,
  notifications: [],
};

let state: Store = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<Store>) {
  state = { ...state, ...patch };
  emit();
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    // サーバの日本語 message（{error, message}）だけをユーザー向け文言にする。
    // 「403 {"error":...}」のようなシステム文字列はトーストに出さない。
    let raw = '';
    let msg = '';
    try {
      raw = await res.text();
      const j = JSON.parse(raw);
      if (j && typeof j.message === 'string' && j.message.trim()) msg = j.message.trim();
    } catch { /* not json */ }
    const clean = msg
      || (res.status === 403 ? 'この操作は許可されていません。運営にお問い合わせください。'
        : res.status === 401 ? 'ログインが必要です。'
        : '通信に失敗しました。時間をおいて再度お試しください。');
    const err = new Error(clean) as Error & { status?: number; raw?: string };
    err.status = res.status;
    err.raw = raw;
    console.error('[api]', path, res.status, raw.slice(0, 200));
    throw err;
  }
  return res.json();
}

export const store = {
  get: () => state,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },

  hydrate: async () => {
    const startedAt = Date.now();
    type BootstrapData = {
      meId: string; me: User; users: User[]; rounds: Round[];
      pendingReviews: PendingReview[]; chats: Chat[];
      buddyIds?: string[]; roundChatActivity?: Record<string, number>; banned?: boolean; isAdmin?: boolean;
      restrictions?: UserRestriction;
      notifications?: AppNotification[];
    };
    // Transient failures are common in the LINE in-app webview (cold starts,
    // a fetch aborted by navigation → "Load failed"). Retry a few times with
    // backoff before giving up, so a momentary blip self-heals instead of
    // leaving the user on an empty shell. Auth failures (401/403) are not
    // retried — retrying won't help.
    let data: BootstrapData | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        data = await api<BootstrapData>('/api/bootstrap');
        break;
      } catch (e) {
        lastErr = e;
        if (/^(401|403)\b/.test((e as Error).message || '')) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    try {
      if (!data) throw (lastErr || new Error('bootstrap failed'));
      setState({
        hydrated: true,
        meId: data.meId,
        users: data.users,
        rounds: data.rounds,
        pendingReviews: data.pendingReviews,
        chats: data.chats,
        buddyIds: data.buddyIds || [],
        roundChatActivity: data.roundChatActivity || {},
        banned: !!data.banned,
        restrictions: data.restrictions || {},
        isAdmin: !!data.isAdmin,
        notifications: data.notifications || [],
      });
      // Fire-and-forget telemetry
      if (typeof window !== 'undefined') {
        import('./telemetry').then(({ track }) => {
          const me = data.users.find((u) => u.id === data.meId) || data.me;
          track('hydrate_success', {
            ms: Date.now() - startedAt,
            meId: data.meId,
            usersCount: data.users.length,
            meInUsers: !!data.users.find((u) => u.id === data.meId),
            meDisplayName: me?.displayName,
            meHasAvatarUrl: !!me?.avatarUrl,
          });
        });
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.error('[store.hydrate] failed:', e);
      setState({ hydrated: true });
      if (typeof window !== 'undefined') {
        import('./telemetry').then(({ track }) => {
          track('hydrate_error', { ms: Date.now() - startedAt, message: msg });
        });
      }
    }
  },

  refreshRounds: async () => {
    const { rounds } = await api<{ rounds: Round[] }>('/api/rounds');
    setState({ rounds });
  },

  refreshMe: async () => {
    const { me } = await api<{ me: User }>('/api/me');
    if (me) setState({ users: state.users.map((u) => (u.id === me.id ? me : u)) });
  },

  // Mark the お知らせ inbox as read up to now (clears the unread highlight on
  // next render). Optimistically bumps the local user's notifReadAt.
  markNotificationsRead: async () => {
    const now = Date.now();
    setState({
      users: state.users.map((u) => (u.id === state.meId ? { ...u, notifReadAt: now } : u)),
    });
    try { await api('/api/notifications/read', { method: 'POST' }); } catch { /* non-fatal */ }
  },

  refreshPending: async () => {
    const data = await api<{ pendingReviews: PendingReview[] }>('/api/bootstrap');
    setState({ pendingReviews: data.pendingReviews });
  },

  // お知らせ（マッチ通知など）を再取得。レビュー送信直後などに呼び、ホームの
  // 「マッチしました」ポップアップを最新の通知で発火させる。
  refreshNotifications: async () => {
    try {
      const data = await api<{ notifications?: AppNotification[]; pendingReviews?: PendingReview[] }>('/api/bootstrap');
      setState({
        notifications: data.notifications || [],
        ...(data.pendingReviews ? { pendingReviews: data.pendingReviews } : {}),
      });
    } catch { /* non-fatal */ }
  },

  addRound: async (input: Partial<Round>) => {
    const { round } = await api<{ round: Round }>('/api/rounds', {
      method: 'POST', body: JSON.stringify(input),
    });
    setState({ rounds: [round, ...state.rounds] });
    return round;
  },

  editRound: async (roundId: string, patch: Partial<Round>) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
    return round;
  },

  deleteRound: async (roundId: string) => {
    await api(`/api/rounds/${roundId}`, { method: 'DELETE' });
    setState({ rounds: state.rounds.filter((r) => r.id !== roundId) });
  },

  joinRound: async (roundId: string, pickup?: { status?: PickupStatus; stations?: string[]; capacity?: number }) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/join`, {
      method: 'POST', body: pickup ? JSON.stringify({ pickup }) : undefined,
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  approveApplicant: async (roundId: string, userId: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/approve`, {
      method: 'POST', body: JSON.stringify({ userId }),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  rejectApplicant: async (roundId: string, userId: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/reject`, {
      method: 'POST', body: JSON.stringify({ userId }),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  kickApplicant: async (roundId: string, userId: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/kick`, {
      method: 'POST', body: JSON.stringify({ userId }),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  leaveRound: async (roundId: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/leave`, { method: 'POST' });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  // ♡「気になる」toggle. Optimistic update for snappy hearts, then reconcile
  // with the server's authoritative interestedIds.
  toggleInterest: async (roundId: string, interested: boolean) => {
    const meId = state.meId;
    setState({
      rounds: state.rounds.map((r) => {
        if (r.id !== roundId) return r;
        const cur = new Set(r.interestedIds || []);
        if (interested) cur.add(meId); else cur.delete(meId);
        return { ...r, interestedIds: Array.from(cur) };
      }),
    });
    try {
      const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/interest`, {
        method: 'POST', body: JSON.stringify({ interested }),
      });
      setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, ...round } : r)) });
    } catch (e) {
      // Revert on failure.
      setState({
        rounds: state.rounds.map((r) => {
          if (r.id !== roundId) return r;
          const cur = new Set(r.interestedIds || []);
          if (interested) cur.delete(meId); else cur.add(meId);
          return { ...r, interestedIds: Array.from(cur) };
        }),
      });
      throw e;
    }
  },

  inviteToRound: async (roundId: string, userId: string, message?: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/invite`, {
      method: 'POST', body: JSON.stringify({ userId, message: message || undefined }),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, ...round } : r)) });
    return round;
  },

  confirmCourse: async (roundId: string, info: { courseName: string; date: string; startTime: string; price?: string }) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/confirm-course`, {
      method: 'POST', body: JSON.stringify(info),
    });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? round : r)) });
  },

  closeRound: async (roundId: string) => {
    await api(`/api/rounds/${roundId}/close`, { method: 'POST' });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'closed' } : r)) });
  },

  completeRound: async (roundId: string) => {
    await api(`/api/rounds/${roundId}/complete`, { method: 'POST' });
    await store.refreshPending();
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'completed' } : r)) });
  },

  saveRoundScores: async (roundId: string, scores: Record<string, number | null>) => {
    const res = await api<{ scores: Record<string, number> }>(`/api/rounds/${roundId}/scores`, {
      method: 'POST',
      body: JSON.stringify({ scores }),
    });
    // Mirror the new score map back into the local store immediately so the
    // UI reflects the save without waiting for a re-bootstrap. We also patch
    // each affected user's recentScores list so their profile pages stay in
    // sync without a refresh.
    const round = state.rounds.find((r) => r.id === roundId);
    const date = round?.date || new Date().toISOString().slice(0, 10);
    const nextScores = res.scores || {};
    setState({
      rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, scores: nextScores } : r)),
      users: state.users.map((u) => {
        if (!(u.id in scores)) return u;
        const list = Array.isArray(u.recentScores) ? [...u.recentScores] : [];
        const idx = list.findIndex((e) => e.date === date);
        const newScore = nextScores[u.id];
        if (newScore === undefined) {
          if (idx >= 0) list.splice(idx, 1);
        } else {
          const entry = { score: newScore, date };
          if (idx >= 0) list[idx] = entry; else list.push(entry);
        }
        const cleaned = list.filter((e) => e.score > 0 && e.date)
          .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
        return { ...u, recentScores: cleaned };
      }),
    });
  },

  submitReview: async (pendingId: string, stars: number, tags: string[], comment?: string, verdict?: string) => {
    const pending = state.pendingReviews.find((p) => p.id === pendingId);
    if (!pending) return;
    await api('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ pendingId, revieweeId: pending.revieweeId, roundId: pending.roundId, stars, tags, comment, verdict }),
    });
    setState({
      pendingReviews: state.pendingReviews.map((p) =>
        p.id === pendingId ? { ...p, status: 'completed', completedAt: Date.now() } : p
      ),
    });
  },

  triggerDemoReview: async () => {
    // Demo only: create pending reviews for u1 and u2 to demonstrate the overlay.
    // In production we wait for completeRound to create real ones.
    const meId = state.meId;
    const targets = ['u1', 'u2'].filter((t) => state.users.some((u) => u.id === t));
    if (!targets.length) return;
    const now = Date.now();
    const newPending: PendingReview[] = targets.map((t) => ({
      id: `p_demo_${meId}_${t}_${now}`,
      roundId: 'demo_past',
      reviewerId: meId,
      revieweeId: t,
      status: 'pending',
      createdAt: now,
    }));
    setState({ pendingReviews: [...state.pendingReviews, ...newPending] });
  },

  updateMe: async (patch: Partial<User>) => {
    const { me } = await api<{ me: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) });
    if (me) {
      const exists = state.users.some((u) => u.id === me.id);
      const users = exists
        ? state.users.map((u) => (u.id === me.id ? me : u))
        : [...state.users, me];
      setState({ users });
    }
  },

  loadChat: async (chatId: string) => {
    const { chat } = await api<{ chat: Chat | null }>(`/api/messages?chatId=${encodeURIComponent(chatId)}`);
    if (chat) {
      const exists = state.chats.find((c) => c.id === chatId);
      const chats = exists
        ? state.chats.map((c) => (c.id === chatId ? { ...chat } : c))
        : [...state.chats, chat];
      setState({ chats });
    }
  },

  sendMessage: async (chatId: string, otherUserId: string, text: string) => {
    const { message } = await api<{ message: Message }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ chatId, otherUserId, text }),
    });
    const chats = state.chats.map((c) =>
      c.id === chatId
        ? { ...c, messages: [...c.messages, message], lastMessage: text, lastMessageAt: message.createdAt }
        : c
    );
    if (!chats.find((c) => c.id === chatId)) {
      chats.push({
        id: chatId,
        participants: [state.meId, otherUserId].sort() as [string, string],
        lastMessage: text, lastMessageAt: message.createdAt,
        unreadCount: { [state.meId]: 0, [otherUserId]: 1 },
        messages: [message],
      });
    }
    setState({ chats });
  },

  markChatRead: (chatId: string) => {
    const meId = state.meId;
    setState({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: { ...c.unreadCount, [meId]: 0 } } : c
      ),
    });
  },
};

export function useStore<T>(selector: (s: Store) => T): T {
  const snapshot = useSyncExternalStore(store.subscribe, store.get, () => initial);
  return selector(snapshot);
}

export function getMe(s: Store): User {
  return (
    s.users.find((u) => u.id === s.meId) || {
      id: s.meId || 'me', displayName: 'ゴルファー', age: 0, area: '', scoreRange: '',
      playStyle: '', frequency: '', avatar: '⛳', color: '#2D8C4E',
      reviewAvg: 0, reviewCount: 0, roundCount: 0, buddyCount: 0,
    }
  );
}

export function getUser(s: Store, id: string): User | undefined {
  return s.users.find((u) => u.id === id);
}
