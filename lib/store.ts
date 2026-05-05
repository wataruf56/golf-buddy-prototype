'use client';

import { useSyncExternalStore } from 'react';
import type { Chat, Message, PendingReview, Review, Round, User } from './types';

type Store = {
  hydrated: boolean;
  meId: string;
  users: User[];
  rounds: Round[];
  pendingReviews: PendingReview[];
  chats: Chat[];
};

const initial: Store = {
  hydrated: false,
  meId: '',
  users: [],
  rounds: [],
  pendingReviews: [],
  chats: [],
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
    let detail = '';
    try { detail = await res.text(); } catch {}
    const err = new Error(`${res.status} ${detail.slice(0, 200) || res.statusText}`);
    console.error('[api]', path, err.message);
    throw err;
  }
  return res.json();
}

export const store = {
  get: () => state,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },

  hydrate: async () => {
    const startedAt = Date.now();
    try {
      const data = await api<{
        meId: string; me: User; users: User[]; rounds: Round[];
        pendingReviews: PendingReview[]; chats: Chat[];
      }>('/api/bootstrap');
      setState({
        hydrated: true,
        meId: data.meId,
        users: data.users,
        rounds: data.rounds,
        pendingReviews: data.pendingReviews,
        chats: data.chats,
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

  refreshPending: async () => {
    const data = await api<{ pendingReviews: PendingReview[] }>('/api/bootstrap');
    setState({ pendingReviews: data.pendingReviews });
  },

  addRound: async (input: Partial<Round>) => {
    const { round } = await api<{ round: Round }>('/api/rounds', {
      method: 'POST', body: JSON.stringify(input),
    });
    setState({ rounds: [round, ...state.rounds] });
    return round;
  },

  joinRound: async (roundId: string) => {
    const { round } = await api<{ round: Round }>(`/api/rounds/${roundId}/join`, { method: 'POST' });
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

  closeRound: async (roundId: string) => {
    await api(`/api/rounds/${roundId}/close`, { method: 'POST' });
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'closed' } : r)) });
  },

  completeRound: async (roundId: string) => {
    await api(`/api/rounds/${roundId}/complete`, { method: 'POST' });
    await store.refreshPending();
    setState({ rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'completed' } : r)) });
  },

  submitReview: async (pendingId: string, stars: number, tags: string[], comment?: string) => {
    const pending = state.pendingReviews.find((p) => p.id === pendingId);
    if (!pending) return;
    await api('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({ pendingId, revieweeId: pending.revieweeId, roundId: pending.roundId, stars, tags, comment }),
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
