import { db as appDb } from './db';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import { isSameGroup } from './groups';
import type { Round } from './types';

// DM（1対1メッセージ）を送れる相手の全社ルール（2026-08-28 改定）。
// サーバーの送信ゲート(/api/messages POST)・can-dm API・UIの出し分けは
// すべてこの1ファイルを使う（個別実装しないこと）。
//
// 【この改定でやったこと】
// 以前は「一度でも同じラウンドにいれば送れる」だった。コンペの参加者は
// 別の組でも全員が対象になり、一度回っただけの相手からずっとDMが届いた。
// 変更後は **お互いが望んだ相手だけ** に絞る。
//
// 送れる相手:
//   1. ゴル友（User.friendIds — QR / 友達申請の承認で相互に入る）
//   2. **お互いが「また回りたい／気になる」を選んだ相手（＝マッチ）**
//      片側だけでは不可。片側だけ許すと、選んでいない人が
//      「返信できないDM」を受け取ることになるため。
//   3. これから／いま一緒に回るラウンドの**同じ組**の人（当日の連絡に要る）
//      完了したラウンドはここに入らない ＝ 過去の同組は 2. が要る。
//      コンペで別の組の人は、開催前でも入らない（組が違えば当日の連絡も要らない）。
//   4. 参加申請・招待の関係（主催者 ↔ 申請中/招待中）
//   5. 募集中(open)ラウンドの主催者・共同管理者（問い合わせ先）
//   6. 管理人（ADMIN_MANAGER_ID）とは常に相互に送れる
//   7. 既存スレッドで相手から受信済みなら返信できる（canDm に chatId を渡した場合）
//   8. **すでにDMのやり取りが始まっている相手**
//      条件を絞ったせいで、進行中の会話が途中で切れてしまうのを防ぐための例外。
//      新しい会話はこの例外では始められない（送るには 1〜7 のどれかが要る）ので、
//      抜け道にはならない。
//
// ただし **「ごめんなさい」で遮断されたペアは、上のどれに当てはまっても送れない**。

const memberSet = (r: Round) => new Set([r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean));
const hostSet = (r: Round) => new Set([r.hostId, ...(r.coHostIds || [])].filter(Boolean));
const seekSet = (r: Round) => new Set([...(r.pendingApplicantIds || []), ...(r.invitedIds || [])].filter(Boolean));

// 自分が何らかの形で関わっている全ラウンド（主催/共同/参加確定/申請中/招待中）。
async function listMyRounds(meId: string): Promise<Round[]> {
  const adb = getAdminDb() as any;
  if (!adb) {
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

  // 管理人は常に相互OK（遮断の対象にもしない）
  if (meId === ADMIN_MANAGER_ID) { cands.forEach((id) => allowed.add(id)); return allowed; }
  for (const id of cands) if (id === ADMIN_MANAGER_ID) allowed.add(id);

  const [me, matched, blocked] = await Promise.all([
    appDb.getUser(meId),
    (async () => { const { mutualMatchSet } = await import('./matchPairs'); return mutualMatchSet(meId); })(),
    (async () => { const { blockedSetOf } = await import('./dmBlock'); return blockedSetOf(meId); })(),
  ]);

  // 1. ゴル友（/api/friends は相互に書き込むので自分側だけ見れば足りる）
  const friends = new Set(me?.friendIds || []);
  for (const id of cands) if (friends.has(id)) allowed.add(id);

  // 2. マッチ（お互いが選び合った相手）
  for (const id of cands) if (matched.has(id)) allowed.add(id);

  if (allowed.size < cands.length) {
    // 5. 募集中ラウンドの主催者/共同管理者
    const openHosts = new Set<string>();
    try {
      const open = await appDb.listRounds({ status: 'open' });
      for (const r of open) { openHosts.add(r.hostId); for (const c of r.coHostIds || []) openHosts.add(c); }
    } catch { /* best-effort */ }

    // 3/4. 自分の関わるラウンドとの関係
    const myRounds = await listMyRounds(meId);
    for (const id of cands) {
      if (allowed.has(id)) continue;
      if (openHosts.has(id)) { allowed.add(id); continue; }
      for (const r of myRounds) {
        const m = memberSet(r), h = hostSet(r), s = seekSet(r);
        // 4. 申請・招待でやり取り中
        if ((h.has(meId) && s.has(id)) || (h.has(id) && s.has(meId))) { allowed.add(id); break; }
        // 3. これから／いま回るラウンドの同じ組
        //    完了済みは対象外。過去に一緒だっただけではもう送れない。
        if (r.status !== 'completed' && m.has(meId) && m.has(id) && isSameGroup(r, meId, id)) {
          allowed.add(id); break;
        }
      }
    }
  }

  // 8. すでに会話が始まっている相手は維持する。
  //    条件を絞った日をまたいで、進行中のやり取りが急に途切れないようにする。
  if (allowed.size < cands.length) {
    try {
      const chats = await appDb.listChatsForUser(meId);
      for (const c of chats) {
        if (!c.lastMessageAt) continue;   // 部屋だけあって1通も無いものは対象外
        for (const p of c.participants || []) {
          if (p !== meId && cands.includes(p)) allowed.add(p);
        }
      }
    } catch { /* 取れなければ他の条件だけで判定される */ }
  }

  // 「ごめんなさい」の遮断は最後に効かせる（どの条件にも優先する）
  blocked.forEach((id) => allowed.delete(id));
  return allowed;
}

// 単体判定。chatId を渡すと「相手から受信済みスレッドへの返信」も許可する。
export async function canDm(meId: string, otherId: string, chatId?: string): Promise<boolean> {
  if (!meId || !otherId || meId === otherId) return false;
  // 遮断は返信の許可よりも強い。ここで先に落とす。
  if (meId !== ADMIN_MANAGER_ID && otherId !== ADMIN_MANAGER_ID) {
    const { isBlocked } = await import('./dmBlock');
    if (await isBlocked(meId, otherId)) return false;
  }
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
export const DM_POLICY_MSG = 'メッセージを送れるのは「ゴル友（QR・友達申請でつながった人）」「お互いに『また回りたい』を選んだ相手」「これから一緒に回る同じ組の人」「参加申請・招待でやり取り中の相手」「募集中ラウンドの主催者」、それとすでにやり取りのある相手のみです';
