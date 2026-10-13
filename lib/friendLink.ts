import { getAdminDb } from './firebase';
import { db as appDb } from './db';

// 「一緒に回ったのに、システム上は接点が無い」相手とつながるための仕組み。
//
// 入口は2つ:
//   ① 友達申請  … 相手のプロフィールから「どこで一緒だったか」を申告して送る。
//                  受け手が承認（または訂正）して初めて成立する。
//   ② QRで友達  … いまどおり読み取った瞬間に友達成立。「同じ組だったか」は
//                  その場では聞かず、確認画面であとからまとめて答える。
//
// どちらも「同じ組で回った」と確定したときだけ相互レビューへ進む。
// 別の組（コンペで一緒）は友達とDMのみで、★（また回りたい率）には影響しない。
//
// 【設計の要点】
// - 申請の事実認定は **受け手の申告を正** とする。申請者が「同じ組」と言っても、
//   受け手が「コンペで一緒だっただけ」と訂正できる。レビューが★に効くため。
// - 断られたことは申請者に伝えない（「返事待ち」のまま見せる）。気まずさを避ける。
// - 「どちらでもない」で送信、または受け手が「心当たりがない」で却下した場合は
//   その相手への申請を24時間ロックする。
// - 2026-10-13〜 受け手の流れ：事実の確認（同じ組／コンペだけ／心当たりなし）→
//   同じ組ならその場で評価 → 「友達になる／ならない」。どれを選んでも申請者には通知しない
//   （承認の通知もやめた）。「ならない」は confirmed_no_friend にして24時間ロック。

export const LOCK_MS = 24 * 3600 * 1000;
/** 確認画面に一度に出す人数。**データは消さない**——出す数を絞るだけ。 */
export const QR_VISIBLE = 10;

export type Claim = 'same_group' | 'competition';
// confirmed_no_friend（2026-10-13〜）… 受け手が「会った」とは認めたが「友達にならない」を選んだ。
//   declined（心当たりがない）とは事実が違うので分ける。申請者には declined と同じく「返事待ち」に見せる。
export type ReqStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'confirmed_no_friend';
export type QrAnswer = 'same_group' | 'other';

export type FriendRequest = {
  id: string;
  fromId: string;
  toId: string;
  claim: Claim;          // 申請者の申告
  metAt: string;         // 'YYYY-MM-DD'（必須）
  message?: string;
  status: ReqStatus;
  accepted?: Claim;      // 受け手が確定させた事実
  reviewed?: boolean;    // 受け手がその場で評価したか（同じ組のときだけ。中身はここに持たない）
  createdAt: number;
  respondedAt?: number;
};

export type QrPending = {
  id: string;            // `${userId}__${otherId}`
  userId: string;
  otherId: string;
  linkedAt: number;
  answer?: QrAnswer;
  answeredAt?: number;
};

export type DirectReview = {
  id: string;            // `${reviewerId}__${revieweeId}`
  reviewerId: string;
  revieweeId: string;
  source: 'friend_request' | 'qr';
  dueAt: number;         // これを過ぎたら通知・表示する
  status: 'pending' | 'done';
  createdAt: number;
  notifiedAt?: number;
  doneAt?: number;
};

const C_REQ = 'friendRequests';
const C_LOCK = '_friendReqLocks';
const C_QR = 'qrPending';
const C_REV = 'directReviews';

export const pairId = (a: string, b: string) => `${a}__${b}`;

// ── ロック（24時間） ───────────────────────────────────────────
export async function lockedUntil(fromId: string, toId: string): Promise<number> {
  const adb = getAdminDb() as any;
  if (!adb) return 0;
  try {
    const s = await adb.collection(C_LOCK).doc(pairId(fromId, toId)).get();
    const until = Number(s.data()?.until || 0);
    return until > Date.now() ? until : 0;
  } catch { return 0; }
}

export async function setLock(fromId: string, toId: string, reason: string): Promise<number> {
  const adb = getAdminDb() as any;
  const until = Date.now() + LOCK_MS;
  if (!adb) return until;
  try {
    await adb.collection(C_LOCK).doc(pairId(fromId, toId))
      .set({ fromId, toId, reason, until, at: Date.now() }, { merge: true });
  } catch { /* ロックできなくても致命的ではない */ }
  return until;
}

// ── 友達申請 ─────────────────────────────────────────────────
export async function getRequest(fromId: string, toId: string): Promise<FriendRequest | null> {
  const adb = getAdminDb() as any;
  if (!adb) return null;
  try {
    const s = await adb.collection(C_REQ).doc(pairId(fromId, toId)).get();
    if (!s.exists) return null;
    return { ...(s.data() || {}), id: s.id } as FriendRequest;
  } catch { return null; }
}

export async function createRequest(input: {
  fromId: string; toId: string; claim: Claim; metAt: string; message?: string;
}): Promise<FriendRequest> {
  const adb = getAdminDb() as any;
  const now = Date.now();
  const doc: Omit<FriendRequest, 'id'> = {
    fromId: input.fromId,
    toId: input.toId,
    claim: input.claim,
    metAt: input.metAt,
    message: (input.message || '').slice(0, 100),
    status: 'pending',
    createdAt: now,
  };
  const id = pairId(input.fromId, input.toId);
  if (adb) await adb.collection(C_REQ).doc(id).set(doc, { merge: false });
  return { ...doc, id };
}

/** 自分に届いている申請（未処理のみ）。 */
export async function listIncoming(meId: string): Promise<FriendRequest[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const s = await adb.collection(C_REQ)
      .where('toId', '==', meId).where('status', '==', 'pending').limit(200).get();
    return s.docs
      .map((d: any) => ({ ...(d.data() || {}), id: d.id } as FriendRequest))
      .sort((a: FriendRequest, b: FriendRequest) => b.createdAt - a.createdAt);
  } catch { return []; }
}

/**
 * 自分が送った申請。
 * **却下されたもの・「友達にならない」を選ばれたものも「返事待ち」として返す**
 * （断られたことは申請者に伝えない方針）。取り消しはできるので、行き先を失うことはない。
 * 受け手の返事の痕跡（accepted / reviewed / respondedAt）は申請者に返さない。
 */
export async function listOutgoing(meId: string): Promise<FriendRequest[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const s = await adb.collection(C_REQ).where('fromId', '==', meId).limit(200).get();
    return s.docs
      .map((d: any) => ({ ...(d.data() || {}), id: d.id } as FriendRequest))
      .filter((r: FriendRequest) => r.status === 'pending' || r.status === 'declined' || r.status === 'confirmed_no_friend')
      .map((r: FriendRequest) => {
        const { accepted: _a, reviewed: _r, respondedAt: _t, ...rest } = r;
        return { ...rest, status: 'pending' as ReqStatus };
      })
      .sort((a: FriendRequest, b: FriendRequest) => b.createdAt - a.createdAt);
  } catch { return []; }
}

export async function setRequestStatus(id: string, patch: Partial<FriendRequest>) {
  const adb = getAdminDb() as any;
  if (!adb) return;
  try { await adb.collection(C_REQ).doc(id).set({ ...patch, respondedAt: Date.now() }, { merge: true }); }
  catch { /* noop */ }
}

// ── 友達関係の確定（相互に friendIds へ追加） ───────────────────
export async function linkFriends(a: string, b: string): Promise<void> {
  const [ua, ub] = await Promise.all([appDb.getUser(a), appDb.getUser(b)]);
  const fa = new Set(ua?.friendIds || []); fa.add(b);
  const fb = new Set(ub?.friendIds || []); fb.add(a);
  await Promise.all([
    appDb.updateUser(a, { friendIds: Array.from(fa) } as any),
    appDb.updateUser(b, { friendIds: Array.from(fb) } as any),
  ]);
}

/**
 * 友達解除（2026-10-14）。お互いの friendIds から外し、まだ答えていない「同じ組？」の確認と、
 * 解除した側がこれから書く予定だった評価の依頼も片づける（解除した相手を評価させないため）。
 * 「思わない」と同じ扱い（マッチ解除・レビュー・DM遮断）は lib/matchFeeling の applyFeeling で別にやる。
 */
export async function unlinkFriends(by: string, other: string): Promise<void> {
  const [ua, ub] = await Promise.all([appDb.getUser(by), appDb.getUser(other)]);
  await Promise.all([
    appDb.updateUser(by, { friendIds: (ua?.friendIds || []).filter((x) => x !== other) } as any),
    appDb.updateUser(other, { friendIds: (ub?.friendIds || []).filter((x) => x !== by) } as any),
  ]);
  const adb = getAdminDb() as any;
  if (!adb) return;
  try {
    const now = Date.now();
    const batch = adb.batch();
    for (const [me, o] of [[by, other], [other, by]]) {
      const q = await adb.collection(C_QR).doc(pairId(me, o)).get();
      if (q.exists && !q.data()?.answer) batch.delete(q.ref);
    }
    const rev = await adb.collection(C_REV).doc(pairId(by, other)).get();
    if (rev.exists && rev.data()?.status !== 'done') batch.set(rev.ref, { status: 'done', doneAt: now, cancelledByUnfriend: true }, { merge: true });
    // 管理画面で「いつ・どちらが解除したか」を追えるように残す
    batch.set(adb.collection('_unfriends').doc(pairId(by, other)), { by, other, at: now }, { merge: true });
    await batch.commit();
  } catch (e) { console.error('[friendLink] unlink cleanup failed (non-fatal)', (e as Error).message); }
}

export async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const [ua, ub] = await Promise.all([appDb.getUser(a), appDb.getUser(b)]);
  return (ua?.blockedUserIds || []).includes(b) || (ub?.blockedUserIds || []).includes(a);
}

// ── QRでつながった人の「同じ組？」確認 ─────────────────────────
/** QRで友達になった瞬間に、双方へ確認待ちを1件ずつ作る。 */
export async function addQrPending(a: string, b: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb) return;
  const now = Date.now();
  try {
    const batch = adb.batch();
    for (const [me, other] of [[a, b], [b, a]]) {
      const ref = adb.collection(C_QR).doc(pairId(me, other));
      // すでに答えている相手には作り直さない（merge:false だと回答が消えるため）
      // scannedBy＝QRを読み取った側（管理画面の「誰が読み取ったか」用・2026-10-13〜）
      batch.set(ref, { userId: me, otherId: other, linkedAt: now, scannedBy: a }, { merge: true });
    }
    await batch.commit();
  } catch { /* noop */ }
}

/** まだ答えていない相手。新しい順。 */
export async function listQrPending(meId: string): Promise<QrPending[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const s = await adb.collection(C_QR).where('userId', '==', meId).limit(300).get();
    return s.docs
      .map((d: any) => ({ ...(d.data() || {}), id: d.id } as QrPending))
      .filter((x: QrPending) => !x.answer)
      .sort((a: QrPending, b: QrPending) => b.linkedAt - a.linkedAt);
  } catch { return []; }
}

export async function saveQrAnswers(
  meId: string,
  answers: Array<{ otherId: string; answer: QrAnswer }>,
): Promise<{ sameGroup: string[] }> {
  const adb = getAdminDb() as any;
  const sameGroup: string[] = [];
  if (!adb) return { sameGroup };
  const now = Date.now();
  try {
    const batch = adb.batch();
    for (const a of answers) {
      if (!a?.otherId || (a.answer !== 'same_group' && a.answer !== 'other')) continue;
      batch.set(
        adb.collection(C_QR).doc(pairId(meId, a.otherId)),
        { userId: meId, otherId: a.otherId, answer: a.answer, answeredAt: now },
        { merge: true },
      );
      if (a.answer === 'same_group') sameGroup.push(a.otherId);
    }
    await batch.commit();
  } catch { /* noop */ }
  return { sameGroup };
}

// ── レビュー依頼（ラウンドに紐づかない直接レビュー） ─────────────
/** 翌日の朝9時（JST）。QR経由のレビューはここまで待ってから届く。 */
export function tomorrowMorningJst(from = Date.now()): number {
  const JST = 9 * 3600 * 1000;
  const d = new Date(from + JST);
  d.setUTCHours(0, 0, 0, 0);              // JSTのその日の0時
  return d.getTime() - JST + 24 * 3600 * 1000 + 9 * 3600 * 1000; // 翌日9時(JST)
}

export async function createDirectReview(input: {
  reviewerId: string; revieweeId: string; source: DirectReview['source']; dueAt: number;
  /** その場で通知済みなら true。cron からの二重催促を防ぐ。 */
  alreadyNotified?: boolean;
}): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb) return;
  const id = pairId(input.reviewerId, input.revieweeId);
  try {
    const cur = await adb.collection(C_REV).doc(id).get();
    // すでに書き終えたレビューは作り直さない（何度も催促しない）
    if (cur.exists && cur.data()?.status === 'done') return;
    await adb.collection(C_REV).doc(id).set({
      reviewerId: input.reviewerId, revieweeId: input.revieweeId,
      source: input.source, dueAt: input.dueAt, status: 'pending', createdAt: Date.now(),
      ...(input.alreadyNotified ? { notifiedAt: Date.now() } : {}),
    }, { merge: true });
  } catch { /* noop */ }
}

/** 期限が来ている自分あてのレビュー依頼。 */
export async function listDueDirectReviews(meId: string): Promise<DirectReview[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const s = await adb.collection(C_REV)
      .where('reviewerId', '==', meId).where('status', '==', 'pending').limit(200).get();
    const now = Date.now();
    return s.docs
      .map((d: any) => ({ ...(d.data() || {}), id: d.id } as DirectReview))
      .filter((x: DirectReview) => x.dueAt <= now)
      .sort((a: DirectReview, b: DirectReview) => a.dueAt - b.dueAt);
  } catch { return []; }
}

/**
 * 書き終えた印をつける。依頼（pending）が無くても done の記録を作る
 * （友達申請の受け手がその場で評価した場合など）。done があると createDirectReview は作り直さない。
 */
export async function markDirectReviewDone(reviewerId: string, revieweeId: string, source?: DirectReview['source']) {
  const adb = getAdminDb() as any;
  if (!adb) return;
  try {
    const ref = adb.collection(C_REV).doc(pairId(reviewerId, revieweeId));
    const cur = await ref.get();
    const now = Date.now();
    await ref.set({
      reviewerId, revieweeId, status: 'done', doneAt: now,
      // 新しく作るときだけ、ほかの項目も埋めておく（既存の依頼の source/dueAt は残す）
      ...(cur.exists ? {} : { source: source || 'friend_request', dueAt: now, createdAt: now, notifiedAt: now }),
    }, { merge: true });
  } catch { /* noop */ }
}

/** cron 用：まだ通知していない、期限到来ぶん。 */
export async function listDirectReviewsToNotify(limit = 300): Promise<DirectReview[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const s = await adb.collection(C_REV).where('status', '==', 'pending').limit(limit).get();
    const now = Date.now();
    return s.docs
      .map((d: any) => ({ ...(d.data() || {}), id: d.id } as DirectReview))
      .filter((x: DirectReview) => x.dueAt <= now && !x.notifiedAt);
  } catch { return []; }
}

export async function markNotified(ids: string[]) {
  const adb = getAdminDb() as any;
  if (!adb || !ids.length) return;
  try {
    const batch = adb.batch();
    ids.forEach((id) => batch.set(adb.collection(C_REV).doc(id), { notifiedAt: Date.now() }, { merge: true }));
    await batch.commit();
  } catch { /* noop */ }
}
