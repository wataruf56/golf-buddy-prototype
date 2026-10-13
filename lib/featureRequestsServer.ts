import 'server-only';
import { getAdminDb } from './firebase';
import { db as appDb } from './db';
import { isTestAccount } from './testAccounts';
import {
  FEATURE_REQUEST_ADMIN_SENDER,
  FEATURE_REQUEST_EMOJI,
  type FeatureRequestAuthor,
  type FeatureRequestItem,
  type FeatureRequestMessage,
  type FeatureRequestStatus,
  type FeatureRequestCategory,
} from './featureRequests';

// 💡 改修要望のサーバー側ヘルパー（Firestore `featureRequests` ＋ サブコレクション `messages`）。
//
//   featureRequests/{id} = {
//     authorId, title, body, category, status, createdAt, updatedAt,
//     lastMessageAt, lastMessage, lastSenderId, replyCount（最初の投稿を除く往復の数）,
//     votes: string[]（「👍 ほしい」を押した会員のID）, pinned,
//     adminUnread（本人が書いて運営がまだ開いていない）, authorUnread（運営が書いて本人がまだ開いていない）
//   }
//   featureRequests/{id}/messages/{autoId} = { senderId（'admin' か userId）, text, createdAt }
//
// 一般の API（app/api/requests）と管理の API（app/api/admin/requests）の両方がここを使う。

export const FEATURE_REQUESTS_COLLECTION = 'featureRequests';

export type FeatureRequestDoc = {
  authorId: string;
  title: string;
  body: string;
  category: FeatureRequestCategory;
  status: FeatureRequestStatus;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessage: string;
  lastSenderId: string;
  replyCount: number;
  votes: string[];
  pinned: boolean;
  adminUnread: boolean;
  authorUnread: boolean;
};

export function requestsCol() {
  const db = getAdminDb() as any;
  if (!db) return null;
  return db.collection(FEATURE_REQUESTS_COLLECTION);
}

/** 本人の表示用情報だけ（名前・アイコン）。LINE ID などは返さない。 */
export async function authorInfo(id: string): Promise<FeatureRequestAuthor> {
  if (id === FEATURE_REQUEST_ADMIN_SENDER) {
    return { id, displayName: 'ゴルトモ運営', avatar: FEATURE_REQUEST_EMOJI.shield, color: '#2A8C82' };
  }
  try {
    const u: any = await appDb.getUser(id);
    if (!u) return { id, displayName: 'メンバー', avatar: String.fromCodePoint(0x26f3) };
    return {
      id,
      displayName: u.displayName || 'メンバー',
      avatar: u.avatar || String.fromCodePoint(0x26f3),
      avatarUrl: u.avatarUrl || '',
      avatarMode: u.avatarMode || '',
      golmotiType: u.golmotiType || '',
      color: u.color || '#2A8C82',
    };
  } catch {
    return { id, displayName: 'メンバー', avatar: String.fromCodePoint(0x26f3) };
  }
}

export async function authorsOf(ids: string[]): Promise<Record<string, FeatureRequestAuthor>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const out: Record<string, FeatureRequestAuthor> = {};
  await Promise.all(uniq.map(async (id) => { out[id] = await authorInfo(id); }));
  return out;
}

export function toItem(id: string, d: any, author: FeatureRequestAuthor, viewerId: string | null): FeatureRequestItem {
  const votes: string[] = Array.isArray(d?.votes) ? d.votes : [];
  return {
    id,
    authorId: String(d?.authorId || ''),
    author,
    title: String(d?.title || ''),
    body: String(d?.body || ''),
    category: (d?.category || 'other') as FeatureRequestCategory,
    status: (d?.status || 'new') as FeatureRequestStatus,
    createdAt: Number(d?.createdAt || 0),
    updatedAt: Number(d?.updatedAt || 0),
    lastMessageAt: Number(d?.lastMessageAt || d?.createdAt || 0),
    lastMessage: String(d?.lastMessage || ''),
    lastSenderId: String(d?.lastSenderId || ''),
    replyCount: Number(d?.replyCount || 0),
    voteCount: votes.length,
    voted: !!viewerId && votes.includes(viewerId),
    pinned: !!d?.pinned,
    mine: !!viewerId && d?.authorId === viewerId,
  };
}

/** 一覧の並び：ピン留め → 最新の動き（lastMessageAt）が新しい順。 */
export function sortItems<T extends { pinned: boolean; lastMessageAt: number; createdAt: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt);
  });
}

/**
 * 全スレッドを読む（最大500件）。viewer がテスト垢でなければ、テスト垢（test_／管理画面登録）が書いた要望は外す。
 * includeTest=true（管理画面）はそのまま全部返す。
 */
export async function listRequestDocs(opts: { viewerId: string | null; includeTest?: boolean }): Promise<Array<{ id: string; data: any }>> {
  const col = requestsCol();
  if (!col) return [];
  const snap = await col.limit(500).get();
  const rows: Array<{ id: string; data: any }> = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
  if (opts.includeTest) return rows;
  const viewerIsTest = opts.viewerId ? await isTestAccount(opts.viewerId) : false;
  if (viewerIsTest) return rows;
  const out: Array<{ id: string; data: any }> = [];
  for (const r of rows) {
    if (await isTestAccount(r.data?.authorId)) continue;
    out.push(r);
  }
  return out;
}

export async function getRequestDoc(id: string): Promise<{ id: string; data: any } | null> {
  const col = requestsCol();
  if (!col || !id) return null;
  const snap = await col.doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, data: snap.data() };
}

export async function listMessages(id: string): Promise<FeatureRequestMessage[]> {
  const col = requestsCol();
  if (!col) return [];
  const snap = await col.doc(id).collection('messages').orderBy('createdAt', 'asc').limit(500).get();
  return snap.docs.map((d: any) => ({ id: d.id, senderId: String(d.data().senderId || ''), text: String(d.data().text || ''), createdAt: Number(d.data().createdAt || 0) }));
}

/** スレッドにメッセージを足し、親ドキュメントの最終更新・返信数・未読フラグを更新する。 */
export async function appendMessage(id: string, senderId: string, text: string, opts: { countAsReply: boolean }): Promise<FeatureRequestMessage> {
  const col = requestsCol();
  if (!col) throw new Error('firestore not initialized');
  const now = Date.now();
  const ref = col.doc(id);
  const msgRef = ref.collection('messages').doc();
  const fromAdmin = senderId === FEATURE_REQUEST_ADMIN_SENDER;
  const db = getAdminDb() as any;
  await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(ref);
    if (!cur.exists) throw new Error('not_found');
    const d = cur.data() || {};
    tx.set(msgRef, { senderId, text, createdAt: now });
    tx.set(ref, {
      updatedAt: now,
      lastMessageAt: now,
      lastMessage: text.slice(0, 120),
      lastSenderId: senderId,
      replyCount: Number(d.replyCount || 0) + (opts.countAsReply ? 1 : 0),
      // 運営の返信 → 本人に未読。本人の返信 → 運営に未読。
      ...(fromAdmin ? { authorUnread: true } : { adminUnread: true }),
    }, { merge: true });
  });
  return { id: msgRef.id, senderId, text, createdAt: now };
}

/** 運営（ADMIN_USER_IDS / ADMIN_NOTIFY_USER_IDS）のLINE userId 一覧。 */
export function adminNotifyIds(): string[] {
  const raw = `${process.env.ADMIN_USER_IDS || ''},${process.env.ADMIN_NOTIFY_USER_IDS || ''}`;
  return Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)));
}

/** 運営へ「新しい要望／本人からの返信」を知らせる（アプリ内お知らせ＋LINE。どちらも best-effort）。 */
export async function notifyAdminsOfRequest(requestId: string, text: string): Promise<void> {
  const ids = adminNotifyIds();
  if (!ids.length) return;
  const link = `/requests/${requestId}`;
  try {
    const { addNotificationMany } = await import('./notifications');
    await addNotificationMany(ids, 'dm', text, link);
  } catch { /* noop */ }
  try {
    const { pushToMany, liffUrl } = await import('./linePush');
    await pushToMany(ids, text, liffUrl(link), 'adminOps');
  } catch { /* noop */ }
}

/** 本人へ「運営から返信が届いた」を知らせる（アプリ内＋LINE）。運営からの連絡は確実に届けたいので LINE も送る（管理人DMと同じ扱い）。 */
export async function notifyAuthorOfAdminReply(requestId: string, authorId: string, title: string): Promise<void> {
  if (!authorId) return;
  const link = `/requests/${requestId}`;
  const text = `${FEATURE_REQUEST_EMOJI.bulb} 改修要望「${title.slice(0, 30)}」に運営から返信が届きました`;
  try {
    const { addNotification } = await import('./notifications');
    await addNotification(authorId, 'dm', text, link);
  } catch { /* noop */ }
  try {
    const { pushTo, liffUrl } = await import('./linePush');
    await pushTo(authorId, `${text}。アプリで続きを読めます。`, liffUrl(link), 'dm');
  } catch { /* noop */ }
}
