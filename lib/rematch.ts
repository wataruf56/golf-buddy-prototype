import 'server-only';
import { getAdminDb } from './firebase';

// 再会エンジンのデータ層。相互マッチ済みペアの「再会セッション」を _rematch に、
// 5段ファネルの計測を _rematchEvents に保存する。docId はペア単位（ソート済み2ID）
// ＝「同一ペアへは1セッション」。前回ラウンドは roundId として文脈に持つ。
export type RematchStatus = 'notified' | 'inputting' | 'agreed' | 'posted' | 'optedout';

export type RematchSession = {
  pairId: string;
  userA: string;              // 辞書順で小さい方
  userB: string;
  roundId: string;            // 直近で相互マッチが成立していた完了ラウンド
  courseName?: string;        // 通知文用（前回コース名 or タイトル）
  roundDate?: string;         // 前回の日付
  matchKind: 'again' | 'romantic';
  notifyCount: number;        // 送った再会通知の回数
  firstNotifyAt?: number;
  lastNotifyAt?: number;
  candidatesA: string[];      // 'YYYY-MM-DD'
  candidatesB: string[];
  agreedDate: string | null;
  agreedAt: number | null;
  postedRoundId: string | null;
  optedOutBy: string[];
  status: RematchStatus;
  updatedAt?: number;
};

export type RematchEvent =
  | 'rematch_notify_open'
  | 'rematch_input_one'
  | 'rematch_input_both'
  | 'rematch_agreed'
  | 'rematch_to_round_post';

const DAY = 24 * 60 * 60 * 1000;
export const rematchDayMs = DAY;

// ペアID（ソート済み）。docId・URL に使える英数＋'__'のみ。
export function pairIdOf(a: string, b: string): string {
  return [a, b].sort().join('__');
}
export function membersOfPair(pairId: string): [string, string] {
  const i = pairId.indexOf('__');
  return [pairId.slice(0, i), pairId.slice(i + 2)];
}

export async function getSession(pairId: string): Promise<RematchSession | null> {
  const db = getAdminDb() as any;
  if (!db) return null;
  try {
    const s = await db.collection('_rematch').doc(pairId).get();
    return s.exists ? ({ pairId, ...s.data() } as RematchSession) : null;
  } catch { return null; }
}

export async function saveSession(pairId: string, patch: Partial<RematchSession>): Promise<void> {
  const db = getAdminDb() as any;
  if (!db) return;
  await db.collection('_rematch').doc(pairId).set({ ...patch, updatedAt: Date.now() }, { merge: true });
}

// 自分が当事者のセッション一覧（新しい順）。
export async function listSessionsForUser(uid: string): Promise<RematchSession[]> {
  const db = getAdminDb() as any;
  if (!db) return [];
  try {
    const [aSnap, bSnap] = await Promise.all([
      db.collection('_rematch').where('userA', '==', uid).limit(200).get(),
      db.collection('_rematch').where('userB', '==', uid).limit(200).get(),
    ]);
    const map = new Map<string, RematchSession>();
    [...aSnap.docs, ...bSnap.docs].forEach((d: any) => map.set(d.id, { pairId: d.id, ...d.data() }));
    return Array.from(map.values()).sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
  } catch { return []; }
}

// 5段ファネルの計測イベントを記録。
export async function recordRematchEvent(
  event: RematchEvent,
  data: { pairId: string; roundId?: string; cycle?: number; userId?: string },
): Promise<void> {
  const db = getAdminDb() as any;
  if (!db) return;
  try {
    await db.collection('_rematchEvents').add({ event, ...data, ts: Date.now() });
  } catch { /* noop */ }
}

// 再会関連の通知（アプリ内＋設定ONならLINE/Web push）。往復・確定通知で使う。
export async function notifyRematch(recipientId: string, text: string, link: string): Promise<void> {
  const [{ addNotification }, { pushTo, liffUrl }, { webPushText }, { isNotifyEnabled }, { db }] = await Promise.all([
    import('./notifications'), import('./linePush'), import('./webPush'), import('./notifyPrefs'), import('./db'),
  ]);
  addNotification(recipientId, 'rematch', text, link).catch(() => {});
  const u = await db.getUser(recipientId);
  if (isNotifyEnabled(u as any, 'rematch')) {
    pushTo(recipientId, text, liffUrl(link)).catch(() => {});
    webPushText(recipientId, '再会エンジン', text, link, `rematch-${link}`).catch(() => {});
  }
}

// 重なり（両者が行ける日）。
export function overlapDates(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return Array.from(new Set(a.filter((d) => setB.has(d)))).sort();
}

// あるラウンド参加者の中で「相互マッチ（again/romantic のどちらか両思い）」の
// ペア一覧を返す。_matchLikes docId=`${kind}__${from}__${to}`。
export async function mutualPairsInRound(memberIds: string[]): Promise<Array<{ a: string; b: string; kind: 'again' | 'romantic' }>> {
  const db = getAdminDb() as any;
  if (!db) return [];
  const members = Array.from(new Set(memberIds.filter(Boolean)));
  const exists = async (id: string) => {
    try { const s = await db.collection('_matchLikes').doc(id).get(); return s.exists; } catch { return false; }
  };
  const pairs: Array<{ a: string; b: string; kind: 'again' | 'romantic' }> = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i], b = members[j];
      // romantic 優先（両方成立なら romantic 表示）。
      for (const kind of ['romantic', 'again'] as const) {
        const [ab, ba] = await Promise.all([
          exists(`${kind}__${a}__${b}`),
          exists(`${kind}__${b}__${a}`),
        ]);
        if (ab && ba) { pairs.push({ a, b, kind }); break; }
      }
    }
  }
  return pairs;
}
