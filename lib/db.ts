import 'server-only';
import { isDemoMode } from './demoMode';
import { getAdminDb } from './firebase';
import { mockUsers, mockRounds, mockReviews, mockChats } from './mockData';
import type { Chat, Message, PendingReview, Review, Round, User } from './types';

export interface DB {
  getUser(id: string): Promise<User | null>;
  upsertUser(user: Partial<User> & { id: string }): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;
  listUsers(ids: string[]): Promise<User[]>;

  listRounds(opts?: { status?: 'open' | 'closed' | 'completed' }): Promise<Round[]>;
  getRound(id: string): Promise<Round | null>;
  createRound(round: Omit<Round, 'id'>): Promise<Round>;
  updateRound(id: string, patch: Partial<Round>): Promise<void>;
  joinRound(id: string, userId: string): Promise<Round>;
  completeRound(id: string): Promise<{ round: Round; pendingForUser: (userId: string) => PendingReview[] }>;

  listReviewsForUser(revieweeId: string): Promise<Review[]>;
  createReview(review: Omit<Review, 'id'>): Promise<Review>;

  listPendingReviews(reviewerId: string): Promise<PendingReview[]>;
  completePendingReview(id: string): Promise<void>;
  createPendingReviews(items: Omit<PendingReview, 'id'>[]): Promise<PendingReview[]>;

  listChatsForUser(userId: string): Promise<Chat[]>;
  getChat(chatId: string): Promise<Chat | null>;
  sendMessage(chatId: string, participants: [string, string], senderId: string, text: string): Promise<Message>;
  markChatRead(chatId: string, userId: string): Promise<void>;
}

/* ===== In-memory demo backend ===== */
class MemoryDB implements DB {
  private users: User[] = [...mockUsers];
  private rounds: Round[] = [...mockRounds];
  private reviews: Review[] = [...mockReviews];
  private pending: PendingReview[] = [];
  private chats: Chat[] = JSON.parse(JSON.stringify(mockChats)) as Chat[];

  async getUser(id: string) { return this.users.find((u) => u.id === id) || null; }
  async upsertUser(u: Partial<User> & { id: string }) {
    const existing = this.users.find((x) => x.id === u.id);
    if (existing) { Object.assign(existing, u); return existing; }
    const created: User = {
      id: u.id, displayName: u.displayName || 'ゴルファー', age: u.age ?? 0,
      area: u.area || '', scoreRange: u.scoreRange || '', playStyle: u.playStyle || '',
      frequency: u.frequency || '', avatar: u.avatar || '⛳', color: u.color || '#2D8C4E',
      reviewAvg: u.reviewAvg ?? 0, reviewCount: u.reviewCount ?? 0,
      roundCount: u.roundCount ?? 0, buddyCount: u.buddyCount ?? 0,
      lineId: u.lineId, gender: u.gender,
    };
    this.users.push(created);
    return created;
  }
  async updateUser(id: string, patch: Partial<User>) {
    const u = this.users.find((x) => x.id === id);
    if (u) Object.assign(u, patch);
  }
  async listUsers(ids: string[]) {
    return this.users.filter((u) => ids.includes(u.id));
  }

  async listRounds(opts?: { status?: 'open' | 'closed' | 'completed' }) {
    let r = [...this.rounds];
    if (opts?.status) r = r.filter((x) => x.status === opts.status);
    return r.sort((a, b) => b.createdAt - a.createdAt);
  }
  async getRound(id: string) { return this.rounds.find((r) => r.id === id) || null; }
  async createRound(round: Omit<Round, 'id'>) {
    const created: Round = { ...round, id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    this.rounds.unshift(created);
    return created;
  }
  async updateRound(id: string, patch: Partial<Round>) {
    const r = this.rounds.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async joinRound(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    if (!r.applicantIds.includes(userId) && r.hostId !== userId) {
      r.applicantIds.push(userId);
      r.currentCount += 1;
    }
    return r;
  }
  async completeRound(id: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    r.status = 'completed';
    const participants = [r.hostId, ...r.applicantIds];
    return {
      round: r,
      pendingForUser: (userId: string) => {
        if (!participants.includes(userId)) return [];
        return participants.filter((p) => p !== userId).map((reviewee) => ({
          id: `p_${id}_${userId}_${reviewee}`,
          roundId: id, reviewerId: userId, revieweeId: reviewee,
          status: 'pending' as const, createdAt: Date.now(),
        }));
      },
    };
  }

  async listReviewsForUser(revieweeId: string) {
    return this.reviews.filter((r) => r.revieweeId === revieweeId).sort((a, b) => b.createdAt - a.createdAt);
  }
  async createReview(rv: Omit<Review, 'id'>) {
    const created: Review = { ...rv, id: `rv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    this.reviews.push(created);
    const u = this.users.find((x) => x.id === rv.revieweeId);
    if (u) {
      const all = this.reviews.filter((r) => r.revieweeId === u.id);
      u.reviewCount = all.length;
      u.reviewAvg = +(all.reduce((s, r) => s + r.stars, 0) / Math.max(all.length, 1)).toFixed(2);
    }
    return created;
  }

  async listPendingReviews(reviewerId: string) {
    return this.pending.filter((p) => p.reviewerId === reviewerId && p.status === 'pending');
  }
  async completePendingReview(id: string) {
    const p = this.pending.find((x) => x.id === id);
    if (p) { p.status = 'completed'; p.completedAt = Date.now(); }
  }
  async createPendingReviews(items: Omit<PendingReview, 'id'>[]) {
    const created = items.map((it) => ({ ...it, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }));
    this.pending.push(...created);
    return created;
  }

  async listChatsForUser(userId: string) {
    return this.chats.filter((c) => c.participants.includes(userId));
  }
  async getChat(chatId: string) { return this.chats.find((c) => c.id === chatId) || null; }
  async sendMessage(chatId: string, participants: [string, string], senderId: string, text: string) {
    let chat = this.chats.find((c) => c.id === chatId);
    if (!chat) {
      chat = { id: chatId, participants, lastMessage: '', lastMessageAt: 0,
        unreadCount: { [participants[0]]: 0, [participants[1]]: 0 }, messages: [] };
      this.chats.push(chat);
    }
    const msg: Message = { id: `m_${Date.now()}`, senderId, text, createdAt: Date.now(), read: false };
    chat.messages.push(msg);
    chat.lastMessage = text;
    chat.lastMessageAt = msg.createdAt;
    const other = participants.find((p) => p !== senderId)!;
    chat.unreadCount[other] = (chat.unreadCount[other] || 0) + 1;
    return msg;
  }
  async markChatRead(chatId: string, userId: string) {
    const chat = this.chats.find((c) => c.id === chatId);
    if (chat) chat.unreadCount[userId] = 0;
  }
}

/* ===== Firestore backend ===== */
class FirestoreDB implements DB {
  private get fs() {
    const d = getAdminDb();
    if (!d) throw new Error('Firestore not initialized — set FIREBASE_* env vars or use NEXT_PUBLIC_DEMO_MODE=true');
    return d;
  }

  private snapToObj<T>(snap: any): T | null {
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() } as T;
  }

  async getUser(id: string) {
    const snap = await this.fs.collection('users').doc(id).get();
    return this.snapToObj<User>(snap);
  }
  async upsertUser(u: Partial<User> & { id: string }) {
    const ref = this.fs.collection('users').doc(u.id);
    const snap = await ref.get();
    if (!snap.exists) {
      const data = {
        displayName: u.displayName || 'ゴルファー', age: u.age ?? 0,
        area: u.area || '', scoreRange: u.scoreRange || '', playStyle: u.playStyle || '',
        frequency: u.frequency || '', avatar: u.avatar || '⛳', color: u.color || '#2D8C4E',
        reviewAvg: u.reviewAvg ?? 0, reviewCount: u.reviewCount ?? 0,
        roundCount: u.roundCount ?? 0, buddyCount: u.buddyCount ?? 0,
        lineId: u.lineId || null, gender: u.gender || null,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      await ref.set(data);
      return { id: u.id, ...data } as unknown as User;
    } else {
      await ref.set({ ...u, updatedAt: Date.now() }, { merge: true });
      const after = await ref.get();
      return { id: after.id, ...after.data() } as User;
    }
  }
  async updateUser(id: string, patch: Partial<User>) {
    await this.fs.collection('users').doc(id).set({ ...patch, updatedAt: Date.now() }, { merge: true });
  }
  async listUsers(ids: string[]) {
    if (!ids.length) return [];
    // Firestore 'in' supports up to 30 in v10+, batch if needed
    const batches: User[] = [];
    const chunkSize = 30;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const snap = await this.fs.collection('users').where('__name__', 'in', chunk).get();
      snap.docs.forEach((d: any) => batches.push({ id: d.id, ...d.data() } as User));
    }
    return batches;
  }

  async listRounds(opts?: { status?: 'open' | 'closed' | 'completed' }) {
    let q: any = this.fs.collection('rounds');
    if (opts?.status) q = q.where('status', '==', opts.status);
    q = q.orderBy('createdAt', 'desc').limit(100);
    const snap = await q.get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Round[];
  }
  async getRound(id: string) {
    const snap = await this.fs.collection('rounds').doc(id).get();
    return this.snapToObj<Round>(snap);
  }
  async createRound(round: Omit<Round, 'id'>) {
    const ref = await this.fs.collection('rounds').add(round);
    return { ...round, id: ref.id };
  }
  async updateRound(id: string, patch: Partial<Round>) {
    await this.fs.collection('rounds').doc(id).set(patch, { merge: true });
  }
  async joinRound(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      if (data.applicantIds?.includes(userId) || data.hostId === userId) {
        return { ...data, id: snap.id } as Round;
      }
      const applicantIds = [...(data.applicantIds || []), userId];
      const currentCount = (data.currentCount || 1) + 1;
      tx.set(ref, { applicantIds, currentCount }, { merge: true });
      return { ...data, id: snap.id, applicantIds, currentCount } as Round;
    });
  }
  async completeRound(id: string) {
    const ref = this.fs.collection('rounds').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('round not found');
    const data = snap.data() as Omit<Round, 'id'>;
    await ref.set({ status: 'completed' }, { merge: true });
    const round = { ...data, id: snap.id, status: 'completed' as const };
    const participants = [round.hostId, ...(round.applicantIds || [])];
    return {
      round,
      pendingForUser: (userId: string) => {
        if (!participants.includes(userId)) return [];
        return participants.filter((p) => p !== userId).map((reviewee) => ({
          id: `p_${id}_${userId}_${reviewee}`,
          roundId: id, reviewerId: userId, revieweeId: reviewee,
          status: 'pending' as const, createdAt: Date.now(),
        }));
      },
    };
  }

  async listReviewsForUser(revieweeId: string) {
    const snap = await this.fs.collection('reviews')
      .where('revieweeId', '==', revieweeId).orderBy('createdAt', 'desc').limit(50).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Review[];
  }
  async createReview(rv: Omit<Review, 'id'>) {
    const ref = await this.fs.collection('reviews').add(rv);
    // Recompute reviewAvg/reviewCount lazily
    const all = await this.listReviewsForUser(rv.revieweeId);
    const avg = +(all.reduce((s, r) => s + r.stars, 0) / Math.max(all.length, 1)).toFixed(2);
    await this.fs.collection('users').doc(rv.revieweeId).set({
      reviewCount: all.length, reviewAvg: avg, updatedAt: Date.now(),
    }, { merge: true });
    return { ...rv, id: ref.id };
  }

  async listPendingReviews(reviewerId: string) {
    const snap = await this.fs.collection('pendingReviews')
      .where('reviewerId', '==', reviewerId).where('status', '==', 'pending').get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as PendingReview[];
  }
  async completePendingReview(id: string) {
    await this.fs.collection('pendingReviews').doc(id).set({
      status: 'completed', completedAt: Date.now(),
    }, { merge: true });
  }
  async createPendingReviews(items: Omit<PendingReview, 'id'>[]) {
    const batch = this.fs.batch();
    const created: PendingReview[] = [];
    for (const it of items) {
      const ref = this.fs.collection('pendingReviews').doc();
      batch.set(ref, it);
      created.push({ ...it, id: ref.id });
    }
    await batch.commit();
    return created;
  }

  async listChatsForUser(userId: string) {
    const snap = await this.fs.collection('chats')
      .where('participants', 'array-contains', userId).orderBy('lastMessageAt', 'desc').limit(50).get();
    const chats: Chat[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      chats.push({ id: d.id, ...data, messages: [] } as Chat);
    }
    return chats;
  }
  async getChat(chatId: string) {
    const ref = this.fs.collection('chats').doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const msgsSnap = await ref.collection('messages').orderBy('createdAt', 'asc').limit(200).get();
    const messages = msgsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Message[];
    return { id: snap.id, ...snap.data(), messages } as Chat;
  }
  async sendMessage(chatId: string, participants: [string, string], senderId: string, text: string) {
    const ref = this.fs.collection('chats').doc(chatId);
    const snap = await ref.get();
    const now = Date.now();
    const other = participants.find((p) => p !== senderId)!;
    if (!snap.exists) {
      await ref.set({
        participants, lastMessage: text, lastMessageAt: now,
        unreadCount: { [participants[0]]: 0, [participants[1]]: 0, [other]: 1 },
        createdAt: now,
      });
    } else {
      const data = snap.data() as any;
      const unread = { ...(data.unreadCount || {}) };
      unread[other] = (unread[other] || 0) + 1;
      await ref.set({ lastMessage: text, lastMessageAt: now, unreadCount: unread }, { merge: true });
    }
    const msgRef = await ref.collection('messages').add({
      senderId, text, createdAt: now, read: false,
    });
    return { id: msgRef.id, senderId, text, createdAt: now, read: false };
  }
  async markChatRead(chatId: string, userId: string) {
    const ref = this.fs.collection('chats').doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() as any;
    const unread = { ...(data.unreadCount || {}) };
    unread[userId] = 0;
    await ref.set({ unreadCount: unread }, { merge: true });
  }
}

/* ===== Singleton ===== */
let _instance: DB | null = null;
function getDb(): DB {
  if (_instance) return _instance;
  _instance = isDemoMode ? new MemoryDB() : new FirestoreDB();
  return _instance;
}

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});
