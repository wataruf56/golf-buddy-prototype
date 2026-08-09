import { db as appDb } from './db';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import type { Round } from './types';

// DM（1対1メッセージ）を送れる相手の全社ルール（2026-08-09 確定仕様）。
// サーバーの送信ゲート(/api/messages POST)・can-dm API・ホームの直近ログイングリッドの
// すべてがこの1ファイルを使う。UI側の出し分けもここの結果に従うこと（個別実装しない）。
//
// 送れる相手:
//   1. QRコード等でつながったゴル友（User.friendIds — /api/friends が相互に書き込む）
//   2. 同じラウンドを回った/回る人（主催者・共同管理者・参加確定に両者が含まれる。
//      完了済み=過去に一緒にラウンド／コンペ、募集中・進行中=現在の同組メンバー。コンペも含む）
//   3. 参加申請・招待の関係（片方が主催者/共同管理者、もう片方が申請中(pending)か招待中(invited)）
//   4. 募集中(open)ラウンドの主催者・共同管理者（＝問い合わせ先として誰でも送れる）
//   5. 管理人（サポート窓口 ADMIN_MANAGER_ID）とは常に相互に送れる
//   6. 既存スレッドで相手から受信済みなら返信できる（canDm に chatId を渡した場合のみ判定）

const memberSet = (r: Round) => new Set([r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean));
const hostSet = (r: Round) => new Set([r.hostId, ...(r.coHostIds || [])].filter(Boolean));
const seekSet = (r: Round) => new Set([...(r.pendingApplicantIds || []), ...(r.invitedIds || [])].filter(Boolean));

// 自分が何らかの形で関わっている全ラウンド（主催/共同/参加確定/申請中/招待中）。
async function listMyRounds(meId: string): Promise<Round[]> {
  const adb = getAdminDb() as any;
  if (!adb) {
    // デモ/メモリ環境: 全件から抽出
    const all = await appDb.listRounds();
    return all.filter((r) => memberSet(r).has(meId) || seekSet(r).has(meId));
  }
  const fields = [
    ['hostId', '==', meId],
    ['coHostIds', 'array-contains', meId],
    ['applicantIds', 'array-contains', meId],
    ['pendingApplicantIds', 'array-contains', meId],
    ['invitedIds', 'array-contains', meId],
  ] as const;
  const rounds: Round[] = [];
  const seen = new Set<string>();
  await Promise.all(fields.map(async ([f, op, v]) => {
    try {
      const snap = await adb.collection('rounds').where(f, op, v).limit(400).get();
      for (const d of snap.docs) {
        if (!seen.has(d.id)) { seen.add(d.id); rounds.push({ id: d.id, ...(d.data() || {}) } as Round); }
      }
    } catch { /* 個別クエリの失敗は無視（他の関係で判定される） */ }
  }));
  return rounds;
}

// candidateIds のうち、meId がDMを送ってよい相手の集合を返す（一括判定・グリッド用）。
export async function dmAllowedSet(meId: string, candidateIds: string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  const cands = Array.from(new Set(candidateIds.filter((id) => id && id !== meId)));
  if (!meId || !cands.length) return allowed;

  // 管理人は常に相互OK
  if (meId === ADMIN_MANAGER_ID) { cands.forEach((id) => allowed.add(id)); return allowed; }
  for (const id of cands) if (id === ADMIN_MANAGER_ID) allowed.add(id);

  // 1. ゴル友（/api/friends は相互書き込みなので自分側だけ見れば足りる）
  const me = await appDb.getUser(meId);
  const friends = new Set(me?.friendIds || []);
  for (const id of cands) if (friends.has(id)) allowed.add(id);
  if (allowed.size === cands.length) return allowed;

  // 4. 募集中ラウンドの主催者/共同管理者
  const openHosts = new Set<string>();
  try {
    const open = await appDb.listRounds({ status: 'open' });
    for (const r of open) { openHosts.add(r.hostId); for (const c of r.coHostIds || []) openHosts.add(c); }
  } catch { /* best-effort */ }

  // 2/3. 自分の関わるラウンドとの関係
  const myRounds = await listMyRounds(meId);
  for (const id of cands) {
    if (allowed.has(id)) continue;
    if (openHosts.has(id)) { allowed.add(id); continue; }
    for (const r of myRounds) {
      const m = memberSet(r), h = hostSet(r), s = seekSet(r);
      if ((m.has(meId) && m.has(id)) || (h.has(meId) && s.has(id)) || (h.has(id) && s.has(meId))) {
        allowed.add(id);
        break;
      }
    }
  }
  return allowed;
}

// 単体判定。chatId を渡すと「相手から受信済みスレッドへの返信」も許可する。
export async function canDm(meId: string, otherId: string, chatId?: string): Promise<boolean> {
  if (!meId || !otherId || meId === otherId) return false;
  const set = await dmAllowedSet(meId, [otherId]);
  if (set.has(otherId)) return true;
  if (chatId) {
    try {
      const chat = await appDb.getChat(chatId);
      if (chat && chat.participants.includes(meId) && chat.participants.includes(otherId)
        && (chat.messages || []).some((m) => m.senderId === otherId)) return true;
    } catch { /* noop */ }
  }
  return false;
}

// UI表示用の説明文（送れない理由の案内）。クライアントでそのまま出す。
export const DM_POLICY_MSG = 'メッセージを送れるのは「ゴル友（QRでつながった人）」「一緒にラウンド・コンペを回った人（予定含む）」「参加申請・招待でやり取り中の相手」「募集中ラウンドの主催者」のみです';
