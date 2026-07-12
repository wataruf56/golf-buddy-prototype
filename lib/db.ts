import 'server-only';
import { isDemoMode } from './demoMode';
import { getAdminDb } from './firebase';
import { mockUsers, mockRounds, mockReviews, mockChats } from './mockData';
import type { Chat, Message, PendingReview, Review, Round, RoundThread, SchedulePoll, User } from './types';

export interface DB {
  getUser(id: string): Promise<User | null>;
  upsertUser(user: Partial<User> & { id: string }): Promise<User>;
  updateUser(id: string, patch: Partial<User>): Promise<void>;
  listUsers(ids: string[]): Promise<User[]>;

  listRounds(opts?: { status?: 'open' | 'closed' | 'completed' }): Promise<Round[]>;
  getRound(id: string): Promise<Round | null>;
  createRound(round: Omit<Round, 'id'>): Promise<Round>;
  updateRound(id: string, patch: Partial<Round>): Promise<void>;
  deleteRound(id: string): Promise<void>;
  joinRound(id: string, userId: string): Promise<Round>;
  approveApplicant(id: string, userId: string): Promise<Round>;
  rejectApplicant(id: string, userId: string): Promise<Round>;
  kickApplicant(id: string, userId: string): Promise<Round>;
  leaveRound(id: string, userId: string): Promise<Round>;
  confirmCourse(id: string, info: { courseName: string; date: string; startTime: string; price?: string }): Promise<Round>;
  completeRound(id: string): Promise<{ round: Round; pendingForUser: (userId: string) => PendingReview[] }>;
  // ♡ 気になる toggle. Returns the updated round and whether it was newly added
  // (so the caller can decide whether to notify the host).
  setInterest(id: string, userId: string, interested: boolean): Promise<{ round: Round; added: boolean }>;
  // Host invites a user. Returns the updated round and whether newly invited.
  inviteToRound(id: string, userId: string): Promise<{ round: Round; added: boolean }>;

  // 日程調整（調整さん）ポール — 募集とは独立したコレクション。
  createPoll(poll: Omit<SchedulePoll, 'id'>): Promise<SchedulePoll>;
  getPoll(id: string): Promise<SchedulePoll | null>;
  updatePoll(id: string, patch: Partial<SchedulePoll>): Promise<void>;

  // Round group chat (messages may belong to a named thread via threadId)
  listRoundMessages(roundId: string): Promise<Message[]>;
  addRoundMessage(roundId: string, senderId: string, text: string, threadId?: string, imageUrl?: string): Promise<Message>;
  listRoundThreads(roundId: string): Promise<RoundThread[]>;
  createRoundThread(roundId: string, name: string, userId: string): Promise<RoundThread>;

  listReviewsForUser(revieweeId: string): Promise<Review[]>;
  listReviewsByUser(reviewerId: string): Promise<Review[]>;
  createReview(review: Omit<Review, 'id'>): Promise<Review>;
  blockUser(userId: string, blockedId: string, action: 'block' | 'unblock'): Promise<string[]>;
  reportUser(reporterId: string, reportedId: string, reason: string): Promise<void>;

  listPendingReviews(reviewerId: string): Promise<PendingReview[]>;
  completePendingReview(id: string, ctx?: { roundId?: string; reviewerId?: string; revieweeId?: string }): Promise<void>;
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
  private roundChats: Map<string, Message[]> = new Map();
  private roundThreads: Map<string, RoundThread[]> = new Map();
  private polls: SchedulePoll[] = [];

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
  async createPoll(poll: Omit<SchedulePoll, 'id'>) {
    const created: SchedulePoll = { ...poll, id: `poll_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
    this.polls.unshift(created);
    return created;
  }
  async getPoll(id: string) { return this.polls.find((p) => p.id === id) || null; }
  async updatePoll(id: string, patch: Partial<SchedulePoll>) {
    const p = this.polls.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }
  async deleteRound(id: string) {
    this.rounds = this.rounds.filter((x) => x.id !== id);
    this.roundChats.delete(id);
    this.roundThreads.delete(id);
  }
  async joinRound(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    if (r.hostId === userId) return r;
    if (r.applicantIds.includes(userId)) return r;
    r.pendingApplicantIds = r.pendingApplicantIds || [];
    if (!r.pendingApplicantIds.includes(userId)) r.pendingApplicantIds.push(userId);
    return r;
  }
  async approveApplicant(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    r.pendingApplicantIds = (r.pendingApplicantIds || []).filter((x) => x !== userId);
    if (!r.applicantIds.includes(userId)) {
      r.applicantIds.push(userId);
      r.currentCount += 1;
    }
    return r;
  }
  async rejectApplicant(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    r.pendingApplicantIds = (r.pendingApplicantIds || []).filter((x) => x !== userId);
    return r;
  }
  async kickApplicant(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    if (r.applicantIds.includes(userId)) {
      r.applicantIds = r.applicantIds.filter((x) => x !== userId);
      r.currentCount = Math.max(1, r.currentCount - 1);
    }
    r.pendingApplicantIds = (r.pendingApplicantIds || []).filter((x) => x !== userId);
    return r;
  }
  async leaveRound(id: string, userId: string) {
    return this.kickApplicant(id, userId);
  }
  async confirmCourse(id: string, info: { courseName: string; date: string; startTime: string; price?: string }) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    r.type = 'confirmed';
    r.dateType = 'fixed';
    r.courseName = info.courseName;
    r.date = info.date;
    r.startTime = info.startTime;
    r.dateRange = undefined;
    if (info.price) r.price = info.price;
    return r;
  }
  async completeRound(id: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    r.status = 'completed';
    r.completedAt = Date.now();
    const participants = [r.hostId, ...r.applicantIds];
    // BUG FIX: bump roundCount for every participant. Previously this never
    // incremented, so profile "ラウンド回数" stayed at 0 forever.
    for (const uid of participants) {
      const u = this.users.find((x) => x.id === uid);
      if (u) u.roundCount = (u.roundCount || 0) + 1;
    }
    return {
      round: r,
      pendingForUser: (userId: string) => {
        // Competitions (5+ spots) → skip mutual reviews entirely. The host
        // explicitly marks these (isCompetition) and feedback among 5+
        // strangers doesn't carry the same weight as a 2〜4 person round.
        if (r.isCompetition) return [];
        if (!participants.includes(userId)) return [];
        return participants.filter((p) => p !== userId).map((reviewee) => ({
          id: `p_${id}_${userId}_${reviewee}`,
          roundId: id, reviewerId: userId, revieweeId: reviewee,
          status: 'pending' as const, createdAt: Date.now(),
        }));
      },
    };
  }

  async setInterest(id: string, userId: string, interested: boolean) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    const cur = new Set(r.interestedIds || []);
    const had = cur.has(userId);
    if (interested) cur.add(userId); else cur.delete(userId);
    r.interestedIds = Array.from(cur);
    return { round: r, added: interested && !had };
  }
  async inviteToRound(id: string, userId: string) {
    const r = this.rounds.find((x) => x.id === id);
    if (!r) throw new Error('round not found');
    const cur = new Set(r.invitedIds || []);
    const had = cur.has(userId);
    cur.add(userId);
    r.invitedIds = Array.from(cur);
    return { round: r, added: !had };
  }

  async listReviewsForUser(revieweeId: string) {
    return this.reviews.filter((r) => r.revieweeId === revieweeId).sort((a, b) => b.createdAt - a.createdAt);
  }
  async listReviewsByUser(reviewerId: string) {
    return this.reviews.filter((r) => r.reviewerId === reviewerId);
  }
  async blockUser(userId: string, blockedId: string, action: 'block' | 'unblock') {
    const u = this.users.find((x) => x.id === userId);
    if (!u) throw new Error('user not found');
    const cur = new Set(u.blockedUserIds || []);
    if (action === 'block') cur.add(blockedId); else cur.delete(blockedId);
    u.blockedUserIds = Array.from(cur);
    return u.blockedUserIds;
  }
  async reportUser(reporterId: string, reportedId: string, reason: string) {
    // Memory backend: just log
    console.log('[report]', { reporterId, reportedId, reason, ts: Date.now() });
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
  async completePendingReview(id: string, ctx?: { roundId?: string; reviewerId?: string; revieweeId?: string }) {
    for (const p of this.pending) {
      const matchById = p.id === id;
      const matchByCtx = ctx && ctx.roundId && ctx.reviewerId && ctx.revieweeId &&
        p.roundId === ctx.roundId && p.reviewerId === ctx.reviewerId && p.revieweeId === ctx.revieweeId;
      if (matchById || matchByCtx) { p.status = 'completed'; p.completedAt = Date.now(); }
    }
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
  async listRoundMessages(roundId: string) {
    return [...(this.roundChats.get(roundId) || [])];
  }
  async addRoundMessage(roundId: string, senderId: string, text: string, threadId?: string, imageUrl?: string) {
    const msg: Message = { id: `rm_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, senderId, text, createdAt: Date.now(), read: false, ...(threadId ? { threadId } : {}), ...(imageUrl ? { imageUrl } : {}) };
    const arr = this.roundChats.get(roundId) || [];
    arr.push(msg);
    this.roundChats.set(roundId, arr);
    return msg;
  }
  async listRoundThreads(roundId: string) {
    return [...(this.roundThreads.get(roundId) || [])].sort((a, b) => a.createdAt - b.createdAt);
  }
  async createRoundThread(roundId: string, name: string, userId: string) {
    const t: RoundThread = { id: `th_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, createdBy: userId, createdAt: Date.now() };
    const arr = this.roundThreads.get(roundId) || [];
    arr.push(t);
    this.roundThreads.set(roundId, arr);
    return t;
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
    const clean: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    await this.fs.collection('users').doc(id).set(clean, { merge: true });
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
    try {
      let q: any = this.fs.collection('rounds');
      if (opts?.status) q = q.where('status', '==', opts.status);
      // sort in code to avoid composite index requirement
      const snap = await q.limit(100).get();
      const rounds = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Round[];
      rounds.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return rounds;
    } catch (e) {
      console.error('[listRounds] failed', e);
      return [];
    }
  }
  async getRound(id: string) {
    const snap = await this.fs.collection('rounds').doc(id).get();
    return this.snapToObj<Round>(snap);
  }
  async createRound(round: Omit<Round, 'id'>) {
    // Firestore rejects objects containing undefined values; strip them out.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(round)) {
      if (v !== undefined) clean[k] = v;
    }
    const ref = await this.fs.collection('rounds').add(clean);
    return { ...(clean as Omit<Round, 'id'>), id: ref.id };
  }
  async updateRound(id: string, patch: Partial<Round>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    await this.fs.collection('rounds').doc(id).set(clean, { merge: true });
  }
  async createPoll(poll: Omit<SchedulePoll, 'id'>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(poll)) if (v !== undefined) clean[k] = v;
    const ref = await this.fs.collection('schedulePolls').add(clean);
    return { ...(clean as Omit<SchedulePoll, 'id'>), id: ref.id };
  }
  async getPoll(id: string) {
    const snap = await this.fs.collection('schedulePolls').doc(id).get();
    return this.snapToObj<SchedulePoll>(snap);
  }
  async updatePoll(id: string, patch: Partial<SchedulePoll>) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
    await this.fs.collection('schedulePolls').doc(id).set(clean, { merge: true });
  }
  async deleteRound(id: string) {
    const ref = this.fs.collection('rounds').doc(id);
    // 削除前にラウンド情報を控える（完了済みなら参加者の roundCount を戻すため）。
    let roundData: any = null;
    try { const s = await ref.get(); roundData = s.exists ? s.data() : null; } catch {}

    // Best-effort cleanup of chat + thread subcollections.
    for (const sub of ['chat', 'threads']) {
      try {
        const snap = await ref.collection(sub).limit(500).get();
        if (!snap.empty) {
          const batch = this.fs.batch();
          snap.docs.forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch (e) { console.error(`[deleteRound] sub ${sub} cleanup failed (non-fatal)`, e); }
    }

    // カスケード①: このラウンドのレビューを削除（被レビュー者の集計を後で再計算）。
    const recompute = new Set<string>();
    try {
      const snap = await this.fs.collection('reviews').where('roundId', '==', id).get();
      if (!snap.empty) {
        const batch = this.fs.batch();
        snap.docs.forEach((d: any) => { const x = d.data(); if (x.revieweeId) recompute.add(x.revieweeId); batch.delete(d.ref); });
        await batch.commit();
      }
    } catch (e) { console.error('[deleteRound] reviews cleanup failed (non-fatal)', e); }

    // カスケード②: このラウンドのレビュー依頼（pendingReviews）を削除。
    try {
      const snap = await this.fs.collection('pendingReviews').where('roundId', '==', id).get();
      if (!snap.empty) {
        const batch = this.fs.batch();
        snap.docs.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) { console.error('[deleteRound] pendingReviews cleanup failed (non-fatal)', e); }

    // カスケード③: このラウンドで付いた「気になる/また回りたい」いいねを削除。
    // → ラウンドを消したら「ゴル友」タブのマッチ一覧からも消える（残骸防止）。
    try {
      const snap = await this.fs.collection('_matchLikes').where('roundId', '==', id).get();
      if (!snap.empty) {
        const batch = this.fs.batch();
        snap.docs.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) { console.error('[deleteRound] matchLikes cleanup failed (non-fatal)', e); }

    // 被レビュー者の reviewAvg / reviewCount を再計算（レビューが減った分を反映）。
    for (const uid of Array.from(recompute)) {
      try {
        const all = await this.listReviewsForUser(uid);
        const avg = all.length ? +(all.reduce((s, r) => s + r.stars, 0) / all.length).toFixed(2) : 0;
        await this.fs.collection('users').doc(uid).set({ reviewCount: all.length, reviewAvg: avg, updatedAt: Date.now() }, { merge: true });
      } catch (e) { console.error('[deleteRound] review recompute failed (non-fatal)', uid, e); }
    }

    // 完了済みラウンドを消したら参加者の roundCount を1減らす（0未満にはしない）。
    if (roundData && roundData.status === 'completed') {
      const parts: string[] = Array.from(new Set([roundData.hostId, ...((roundData.applicantIds as string[]) || [])].filter(Boolean)));
      await Promise.all(parts.map(async (uid) => {
        try {
          const us = await this.fs.collection('users').doc(uid).get();
          if (us.exists) await us.ref.set({ roundCount: Math.max(0, (us.data().roundCount || 0) - 1) }, { merge: true });
        } catch {}
      }));
    }

    await ref.delete();
  }
  async joinRound(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      if (data.hostId === userId || data.applicantIds?.includes(userId)) {
        return { ...data, id: snap.id } as Round;
      }
      const pending = data.pendingApplicantIds || [];
      if (pending.includes(userId)) return { ...data, id: snap.id } as Round;
      const pendingApplicantIds = [...pending, userId];
      tx.set(ref, { pendingApplicantIds }, { merge: true });
      return { ...data, id: snap.id, pendingApplicantIds } as Round;
    });
  }
  async approveApplicant(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      const pending = (data.pendingApplicantIds || []).filter((x) => x !== userId);
      const applicants = data.applicantIds || [];
      const applicantIds = applicants.includes(userId) ? applicants : [...applicants, userId];
      const currentCount = applicants.includes(userId)
        ? (data.currentCount || 1)
        : (data.currentCount || 1) + 1;
      tx.set(ref, { pendingApplicantIds: pending, applicantIds, currentCount }, { merge: true });
      return { ...data, id: snap.id, pendingApplicantIds: pending, applicantIds, currentCount } as Round;
    });
  }
  async rejectApplicant(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      const pending = (data.pendingApplicantIds || []).filter((x) => x !== userId);
      tx.set(ref, { pendingApplicantIds: pending }, { merge: true });
      return { ...data, id: snap.id, pendingApplicantIds: pending } as Round;
    });
  }
  async kickApplicant(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      const wasApproved = (data.applicantIds || []).includes(userId);
      const applicantIds = (data.applicantIds || []).filter((x) => x !== userId);
      const pending = (data.pendingApplicantIds || []).filter((x) => x !== userId);
      const currentCount = wasApproved ? Math.max(1, (data.currentCount || 1) - 1) : (data.currentCount || 1);
      tx.set(ref, { applicantIds, pendingApplicantIds: pending, currentCount }, { merge: true });
      return { ...data, id: snap.id, applicantIds, pendingApplicantIds: pending, currentCount } as Round;
    });
  }
  async leaveRound(id: string, userId: string) {
    return this.kickApplicant(id, userId);
  }
  async confirmCourse(id: string, info: { courseName: string; date: string; startTime: string; price?: string }) {
    const ref = this.fs.collection('rounds').doc(id);
    const patch: Record<string, unknown> = {
      type: 'confirmed', dateType: 'fixed',
      courseName: info.courseName, date: info.date, startTime: info.startTime,
      dateRange: null,
    };
    if (info.price) patch.price = info.price;
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return { id: snap.id, ...snap.data() } as Round;
  }
  async completeRound(id: string) {
    const ref = this.fs.collection('rounds').doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('round not found');
    const data = snap.data() as Omit<Round, 'id'>;
    const completedAt = Date.now();
    await ref.set({ status: 'completed', completedAt }, { merge: true });
    const round = { ...data, id: snap.id, status: 'completed' as const, completedAt };
    const participants = [round.hostId, ...(round.applicantIds || [])];

    // BUG FIX: bump roundCount on every participant's user doc. Previously
    // never happened → profile "ラウンド回数" stayed at 0.
    // FieldValue.increment is atomic and safe under concurrent completions.
    try {
      const admin = require('firebase-admin');
      const INC = admin.firestore.FieldValue.increment(1);
      await Promise.all(participants.map((uid) =>
        this.fs.collection('users').doc(uid).set({ roundCount: INC }, { merge: true })
          .catch((e: any) => console.warn('[completeRound] roundCount bump failed', uid, e)),
      ));
    } catch (e) {
      console.warn('[completeRound] FieldValue.increment unavailable', e);
    }

    return {
      round,
      pendingForUser: (userId: string) => {
        // Competitions (5+ spots) → skip mutual reviews entirely. Mass
        // mutual reviews among strangers don't carry the same signal as a
        // 2〜4 person round and just noise up the queue.
        if (round.isCompetition) return [];
        if (!participants.includes(userId)) return [];
        return participants.filter((p) => p !== userId).map((reviewee) => ({
          id: `p_${id}_${userId}_${reviewee}`,
          roundId: id, reviewerId: userId, revieweeId: reviewee,
          status: 'pending' as const, createdAt: Date.now(),
        }));
      },
    };
  }

  async setInterest(id: string, userId: string, interested: boolean) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      const cur = new Set<string>(data.interestedIds || []);
      const had = cur.has(userId);
      if (interested) cur.add(userId); else cur.delete(userId);
      const interestedIds = Array.from(cur);
      tx.set(ref, { interestedIds }, { merge: true });
      return { round: { ...data, id: snap.id, interestedIds } as Round, added: interested && !had };
    });
  }
  async inviteToRound(id: string, userId: string) {
    const ref = this.fs.collection('rounds').doc(id);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('round not found');
      const data = snap.data() as Omit<Round, 'id'>;
      const cur = new Set<string>(data.invitedIds || []);
      const had = cur.has(userId);
      cur.add(userId);
      const invitedIds = Array.from(cur);
      tx.set(ref, { invitedIds }, { merge: true });
      return { round: { ...data, id: snap.id, invitedIds } as Round, added: !had };
    });
  }

  async listReviewsForUser(revieweeId: string) {
    try {
      const snap = await this.fs.collection('reviews')
        .where('revieweeId', '==', revieweeId).limit(50).get();
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Review[];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return list;
    } catch (e) {
      console.error('[listReviewsForUser] failed', e);
      return [];
    }
  }
  async listReviewsByUser(reviewerId: string) {
    try {
      const snap = await this.fs.collection('reviews')
        .where('reviewerId', '==', reviewerId).limit(200).get();
      return snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Review[];
    } catch (e) {
      console.error('[listReviewsByUser] failed', e);
      return [];
    }
  }
  async blockUser(userId: string, blockedId: string, action: 'block' | 'unblock') {
    const ref = this.fs.collection('users').doc(userId);
    return await this.fs.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const cur = new Set<string>(data.blockedUserIds || []);
      if (action === 'block') cur.add(blockedId); else cur.delete(blockedId);
      const arr = Array.from(cur);
      tx.set(ref, { blockedUserIds: arr, updatedAt: Date.now() }, { merge: true });
      return arr;
    });
  }
  async reportUser(reporterId: string, reportedId: string, reason: string) {
    await this.fs.collection('_reports').add({
      reporterId, reportedId, reason: String(reason).slice(0, 1000), ts: Date.now(),
    });
  }
  async createReview(rv: Omit<Review, 'id'>) {
    // Firestore rejects undefined; strip them.
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rv)) if (v !== undefined) clean[k] = v;
    const ref = await this.fs.collection('reviews').add(clean);
    // Recompute reviewAvg/reviewCount lazily
    const all = await this.listReviewsForUser(rv.revieweeId);
    const avg = +(all.reduce((s, r) => s + r.stars, 0) / Math.max(all.length, 1)).toFixed(2);
    await this.fs.collection('users').doc(rv.revieweeId).set({
      reviewCount: all.length, reviewAvg: avg, updatedAt: Date.now(),
    }, { merge: true });
    return { ...(clean as Omit<Review, 'id'>), id: ref.id };
  }

  async listPendingReviews(reviewerId: string) {
    try {
      const snap = await this.fs.collection('pendingReviews')
        .where('reviewerId', '==', reviewerId).where('status', '==', 'pending').get();
      // CRITICAL: doc id wins over any stale `id` field in data — we changed
      // the convention so that completePendingReview can target the right doc.
      return snap.docs.map((d: any) => {
        const { id: _ignored, ...rest } = d.data();
        return { id: d.id, ...rest } as PendingReview;
      });
    } catch (e) {
      console.error('[listPendingReviews] failed', e);
      return [];
    }
  }
  async completePendingReview(id: string, ctx?: { roundId?: string; reviewerId?: string; revieweeId?: string }) {
    const patch = { status: 'completed', completedAt: Date.now() };
    const coll = this.fs.collection('pendingReviews');
    // 1) Try direct doc(id) — works for new docs created with deterministic id.
    if (id) {
      try { await coll.doc(id).update(patch); }
      catch { /* doc may not exist with that id; fall through */ }
    }
    // 2) Defensive: query by triple and complete every matching pending doc.
    //    Handles legacy docs that were created with auto-id but data.id = deterministic.
    if (ctx?.roundId && ctx?.reviewerId && ctx?.revieweeId) {
      try {
        const snap = await coll
          .where('roundId', '==', ctx.roundId)
          .where('reviewerId', '==', ctx.reviewerId)
          .where('revieweeId', '==', ctx.revieweeId)
          .get();
        const batch = this.fs.batch();
        snap.docs.forEach((d: any) => batch.set(d.ref, patch, { merge: true }));
        if (!snap.empty) await batch.commit();
      } catch (e) { console.error('[completePendingReview triple-update] failed', e); }
    }
  }
  async createPendingReviews(items: Omit<PendingReview, 'id'>[] | PendingReview[]) {
    // Use the deterministic id (p_${roundId}_${reviewer}_${reviewee}) as the
    // Firestore doc id when present so completePendingReview can find and
    // mutate the same doc later. Skips dupes via merge:true.
    const batch = this.fs.batch();
    const created: PendingReview[] = [];
    for (const it of items) {
      const data = { ...(it as any) };
      const requestedId = data.id;
      delete data.id; // never store the id field inside the doc payload
      const ref = requestedId
        ? this.fs.collection('pendingReviews').doc(requestedId)
        : this.fs.collection('pendingReviews').doc();
      batch.set(ref, data, { merge: true });
      created.push({ ...data, id: ref.id });
    }
    await batch.commit();
    return created;
  }

  async listChatsForUser(userId: string) {
    // Avoid composite-index requirement: filter only, sort in app code.
    try {
      const snap = await this.fs.collection('chats')
        .where('participants', 'array-contains', userId).limit(50).get();
      const chats: Chat[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data(), messages: [] } as Chat));
      chats.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      return chats;
    } catch (e) {
      console.error('[listChatsForUser] failed', e);
      return [];
    }
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
  async listRoundMessages(roundId: string) {
    try {
      const snap = await this.fs.collection('rounds').doc(roundId).collection('chat').limit(200).get();
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Message[];
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return list;
    } catch (e) {
      console.error('[listRoundMessages] failed', e);
      return [];
    }
  }
  async addRoundMessage(roundId: string, senderId: string, text: string, threadId?: string, imageUrl?: string) {
    const now = Date.now();
    const data: any = { senderId, text, createdAt: now, read: false };
    if (threadId) data.threadId = threadId;
    if (imageUrl) data.imageUrl = imageUrl;
    const ref = await this.fs.collection('rounds').doc(roundId).collection('chat').add(data);
    return { id: ref.id, senderId, text, createdAt: now, read: false, ...(threadId ? { threadId } : {}), ...(imageUrl ? { imageUrl } : {}) };
  }
  async listRoundThreads(roundId: string) {
    try {
      const snap = await this.fs.collection('rounds').doc(roundId).collection('threads').limit(100).get();
      const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as RoundThread[];
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return list;
    } catch (e) {
      console.error('[listRoundThreads] failed', e);
      return [];
    }
  }
  async createRoundThread(roundId: string, name: string, userId: string) {
    const now = Date.now();
    const ref = await this.fs.collection('rounds').doc(roundId).collection('threads').add({ name, createdBy: userId, createdAt: now });
    return { id: ref.id, name, createdBy: userId, createdAt: now };
  }
}

/* ===== Singleton =====
 * In demo mode each Next.js API route is bundled separately, which would
 * give each route its own MemoryDB. We pin the instance on globalThis so
 * writes from /api/me are visible to reads from /api/bootstrap.
 */
const GLOBAL_KEY = '__golfbuddy_db__';
function getDb(): DB {
  const g = globalThis as unknown as Record<string, DB | undefined>;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY] as DB;
  g[GLOBAL_KEY] = isDemoMode ? new MemoryDB() : new FirestoreDB();
  return g[GLOBAL_KEY] as DB;
}

export const db: DB = new Proxy({} as DB, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});
