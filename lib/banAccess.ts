import 'server-only';
import { getAdminDb } from './firebase';

// "赤バン" — admin block for the community/matching features (募集・参加・
// チャット・気になる・招待・DM・レビュー). Mirrors lib/swingAccess but as a
// DENY-list. Stored in Firestore `_banAccess/banned` { userIds: string[] }.
// Cached 30s for low latency.

let _cache: { ids: Set<string>; ts: number } | null = null;
const CACHE_MS = 30 * 1000;

async function getBannedSet(): Promise<Set<string>> {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return _cache.ids;
  const db = getAdminDb();
  if (!db) return new Set();
  try {
    const snap = await db.collection('_banAccess').doc('banned').get();
    const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
    const ids = new Set(arr);
    _cache = { ids, ts: Date.now() };
    return ids;
  } catch {
    return _cache?.ids || new Set();
  }
}

export function invalidateBanCache(): void { _cache = null; }

export async function isBanned(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const ids = await getBannedSet();
  return ids.has(userId);
}

export async function setBanned(userId: string, banned: boolean): Promise<void> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const ref = db.collection('_banAccess').doc('banned');
  const snap = await ref.get();
  const arr: string[] = snap.exists ? (snap.data()?.userIds || []) : [];
  const set = new Set(arr);
  if (banned) set.add(userId); else set.delete(userId);
  await ref.set({ userIds: Array.from(set), updatedAt: Date.now() }, { merge: true });
  invalidateBanCache();
}

export async function listBanned(): Promise<string[]> {
  const fs = await getBannedSet();
  return Array.from(fs);
}

// バン済みユーザーIDのSet（bootstrap等で一括除外するのに使う）。
export async function getBannedIdSet(): Promise<Set<string>> {
  return getBannedSet();
}

// ============ 部分制限（通報対応などで機能の一部だけ止める） ============
// 赤バン（全停止）とは別に、ユーザーごとに個別機能だけを制限する。
//   noCreate         : ラウンド募集ができない
//   noApplyAll       : すべてのラウンドに参加申込できない
//   applyBlockHostIds: この主催者(ID)のラウンドだけ参加申込できない
//   noInvite         : ゴルトモ招待が使えない
//   noChat           : ラウンドのグループチャットに投稿できない
//   noDM             : 1:1 のダイレクトメッセージを送れない
//   noInterest       : ラウンドに「気になる」ができない
//   noReview         : レビューを投稿できない
// Firestore `_banAccess/restrictions` の map フィールドに保存。30秒キャッシュ。
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

// 真偽フラグのキー一覧（保存・正規化で使う）。
export const RESTRICTION_FLAGS: Array<keyof UserRestriction> = [
  'noCreate', 'noApplyAll', 'noInvite', 'noChat', 'noDM', 'noInterest', 'noReview',
];

let _rcache: { map: Record<string, UserRestriction>; ts: number } | null = null;

async function getRestrictionMap(): Promise<Record<string, UserRestriction>> {
  if (_rcache && Date.now() - _rcache.ts < CACHE_MS) return _rcache.map;
  const db = getAdminDb();
  if (!db) return {};
  try {
    const snap = await db.collection('_banAccess').doc('restrictions').get();
    const map: Record<string, UserRestriction> = snap.exists ? (snap.data()?.map || {}) : {};
    _rcache = { map, ts: Date.now() };
    return map;
  } catch {
    return _rcache?.map || {};
  }
}

export function invalidateRestrictionCache(): void { _rcache = null; }

export async function getRestriction(userId: string | null | undefined): Promise<UserRestriction> {
  if (!userId) return {};
  const map = await getRestrictionMap();
  return map[userId] || {};
}

export async function listRestrictions(): Promise<Record<string, UserRestriction>> {
  return getRestrictionMap();
}

export async function setRestriction(userId: string, patch: UserRestriction): Promise<UserRestriction> {
  const db = getAdminDb();
  if (!db) throw new Error('firestore not initialized');
  const ref = db.collection('_banAccess').doc('restrictions');
  const snap = await ref.get();
  const map: Record<string, UserRestriction> = snap.exists ? (snap.data()?.map || {}) : {};
  const cur = map[userId] || {};
  // 正規化：真偽フラグを取り込み、applyBlockHostIds は重複除去。全項目が空なら削除。
  const next: UserRestriction = {
    applyBlockHostIds: Array.from(new Set(
      (patch.applyBlockHostIds ?? cur.applyBlockHostIds ?? []).map((s) => String(s).trim()).filter(Boolean),
    )).slice(0, 200),
  };
  for (const f of RESTRICTION_FLAGS) {
    const v = (patch as any)[f] ?? (cur as any)[f] ?? false;
    if (v) (next as any)[f] = true;
  }
  const anyFlag = RESTRICTION_FLAGS.some((f) => (next as any)[f]);
  const isEmpty = !anyFlag && (next.applyBlockHostIds || []).length === 0;
  if (isEmpty) delete map[userId]; else map[userId] = next;
  await ref.set({ map, updatedAt: Date.now() }, { merge: true });
  invalidateRestrictionCache();
  return isEmpty ? {} : next;
}
