// グループチャットの未読件数（LINEの①②のようなバッジ）（2026-10-13）。画面とサーバーの両方で使う（server-only は import しない）。
// 既読の時刻は「本流」と「スレッドごと」に分けて持つ（users.roundChatSeen）：
//   roundChatSeen[募集ID]                … 本流（スレッド以外）をここまで見た
//   roundChatSeen[募集ID__スレッドID]    … そのスレッドをここまで見た（無ければ本流の時刻で代用）
// 自分の発言は数えない。スレッドが立っただけ（まだ発言なし）は「NEW」として1件に数える。
export const threadSeenKey = (roundId: string, threadId: string) => `${roundId}__${threadId}`;

export type RoundUnread = { main: number; threads: Record<string, number>; newThreads: string[]; total: number };

type Msg = { senderId?: string; createdAt?: number; threadId?: string };
type Thread = { id: string; createdAt?: number; createdBy?: string };

export function computeRoundUnread(
  roundId: string, meId: string, messages: Msg[], threads: Thread[], seen: Record<string, number>,
): RoundUnread {
  const mainSeen = Number(seen[roundId]) || 0;
  const seenOf = (tid?: string) => (tid ? Number(seen[threadSeenKey(roundId, tid)]) || mainSeen : mainSeen);
  let main = 0;
  const th: Record<string, number> = {};
  for (const m of messages) {
    if (!m || m.senderId === meId) continue;
    const at = Number(m.createdAt) || 0;
    if (at <= seenOf(m.threadId)) continue;
    if (m.threadId) th[m.threadId] = (th[m.threadId] || 0) + 1; else main += 1;
  }
  const newThreads = threads
    .filter((t) => t.createdBy !== meId && (Number(t.createdAt) || 0) > seenOf(t.id) && !th[t.id])
    .map((t) => t.id);
  const total = main + Object.values(th).reduce((a, b) => a + b, 0) + newThreads.length;
  return { main, threads: th, newThreads, total };
}

export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));
