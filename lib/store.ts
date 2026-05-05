'use client';

import { useSyncExternalStore } from 'react';
import {
  ME_ID, mockChats, mockPendingReviews, mockReviews, mockRounds, mockUsers,
} from './mockData';
import type { Chat, Message, PendingReview, Review, Round, User } from './types';

type Store = {
  users: User[];
  rounds: Round[];
  reviews: Review[];
  pendingReviews: PendingReview[];
  chats: Chat[];
  meId: string;
};

const initial: Store = {
  users: mockUsers,
  rounds: mockRounds,
  reviews: mockReviews,
  pendingReviews: mockPendingReviews,
  chats: mockChats,
  meId: ME_ID,
};

let state: Store = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const store = {
  get: () => state,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  setMe: (id: string) => {
    state = { ...state, meId: id };
    emit();
  },
  addRound: (r: Round) => {
    state = { ...state, rounds: [r, ...state.rounds] };
    emit();
  },
  joinRound: (roundId: string, userId: string) => {
    state = {
      ...state,
      rounds: state.rounds.map((r) =>
        r.id === roundId && !r.applicantIds.includes(userId)
          ? { ...r, applicantIds: [...r.applicantIds, userId], currentCount: r.currentCount + 1 }
          : r
      ),
    };
    emit();
  },
  closeRound: (roundId: string) => {
    state = {
      ...state,
      rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'closed' } : r)),
    };
    emit();
  },
  completeRound: (roundId: string) => {
    const round = state.rounds.find((r) => r.id === roundId);
    if (!round) return;
    const participants = [round.hostId, ...round.applicantIds];
    const now = Date.now();
    const newPending: PendingReview[] = [];
    for (const reviewer of participants) {
      for (const reviewee of participants) {
        if (reviewer === reviewee) continue;
        if (reviewer !== state.meId) continue;
        newPending.push({
          id: `p_${roundId}_${reviewer}_${reviewee}`,
          roundId, reviewerId: reviewer, revieweeId: reviewee,
          status: 'pending', createdAt: now,
        });
      }
    }
    state = {
      ...state,
      rounds: state.rounds.map((r) => (r.id === roundId ? { ...r, status: 'completed' } : r)),
      pendingReviews: [...state.pendingReviews, ...newPending],
    };
    emit();
  },
  submitReview: (pendingId: string, stars: number, tags: string[], comment?: string) => {
    const pending = state.pendingReviews.find((p) => p.id === pendingId);
    if (!pending) return;
    const review: Review = {
      id: `rv_${pendingId}`,
      roundId: pending.roundId,
      reviewerId: pending.reviewerId,
      revieweeId: pending.revieweeId,
      stars, tags, comment,
      createdAt: Date.now(), isAnonymous: true,
    };
    state = {
      ...state,
      reviews: [...state.reviews, review],
      pendingReviews: state.pendingReviews.map((p) =>
        p.id === pendingId ? { ...p, status: 'completed', completedAt: Date.now() } : p
      ),
    };
    emit();
  },
  triggerDemoReview: () => {
    const meId = state.meId;
    const targets = ['u1', 'u2'];
    const now = Date.now();
    const newPending: PendingReview[] = targets.map((t) => ({
      id: `p_demo_${meId}_${t}_${now}`,
      roundId: 'demo_past', reviewerId: meId, revieweeId: t,
      status: 'pending', createdAt: now,
    }));
    state = { ...state, pendingReviews: [...state.pendingReviews, ...newPending] };
    emit();
  },
  sendMessage: (chatId: string, text: string) => {
    const meId = state.meId;
    const now = Date.now();
    const msg: Message = { id: `m_${now}`, senderId: meId, text, createdAt: now, read: false };
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, msg], lastMessage: text, lastMessageAt: now }
          : c
      ),
    };
    emit();
  },
  markChatRead: (chatId: string) => {
    const meId = state.meId;
    state = {
      ...state,
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: { ...c.unreadCount, [meId]: 0 } } : c
      ),
    };
    emit();
  },
};

export function useStore<T>(selector: (s: Store) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(initial));
}

export function getMe(s: Store): User {
  return s.users.find((u) => u.id === s.meId) || s.users[0];
}

export function getUser(s: Store, id: string): User | undefined {
  return s.users.find((u) => u.id === id);
}
