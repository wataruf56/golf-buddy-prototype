import { db as appDb } from './db';
import { ADMIN_MANAGER_ID } from './adminManagerId';

// DM（1対1メッセージ）を送れる相手の全社ルール（2026-10-13 改定）。
// サーバーの送信ゲート(/api/messages POST)・can-dm API・UIの出し分けは
// すべてこの1ファイルを使う（個別実装しないこと）。
//
// 【この改定でやったこと】
// 2026-08-28 の改定では「同じ組で回る予定」「申請・招待の関係」「募集中の主催者」
// 「すでにやり取りがある」でもDMを許していた。その結果、一度ラウンド募集に問い合わせただけの
// 相手が、ラウンドが終わったあとも友達リストに残り、ずっとDMできる状態になっていた
// （実例：「かすみ」さんの募集に問い合わせた人が終了後も友達リストから DM できた）。
// 変更後は DM を **プライベートな関係だけ** に絞る。募集まわりの連絡は、募集のグループチャット内の
// 「❓ 主催者に質問」（主催者と質問した人だけが読める非公開スレッド・lib/roundQuestion）で行う。
//
// 送れる相手（これだけ）:
//   1. ゴル友（User.friendIds — QR / 友達申請の承認で相互に入る）
//   2. **お互いが「また回りたい／💘 気になる」を選んだ相手（＝マッチ）**（lib/matchPairs）
//      片側だけでは不可。片側だけ許すと、選んでいない人が「返信できないDM」を受け取ることになるため。
//   3. 管理人（ADMIN_MANAGER_ID）とは常に相互に送れる
//
// やめたもの（2026-10-13）:
//   × これから一緒に回る同じ組の人 … グループチャットで連絡できる
//   × 参加申請・招待の関係（主催者 ↔ 申請中/招待中） … 「❓ 主催者に質問」で連絡できる
//   × 募集中(open)ラウンドの主催者・共同管理者 … 同上
//   × 主催者 → 取りやめた人（60日以内） … 主催者側から「❓ 個別に連絡」でスレッドを立てられる
//   × 既存スレッドで相手から受信済みなら返信できる／すでにやり取りが始まっている相手
//      … これが「友達ではないのにDMし続けられる」抜け道になっていた。既存の会話は**読める**が、
//        1〜3 の関係が無ければ入力欄は出ない（チャット画面は dmAllowed=false の案内を出す）。
//
// ただし **「ごめんなさい（思わない）」で遮断されたペアは、上のどれに当てはまっても送れない**（lib/dmBlock）。
// 「どっちでもいい」（closeDm）はマッチを外す操作なので、2. から自然に外れる。

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
    // 相互の「行きたい」と相互の「💘 気になる」の和集合（友達リスト /buddies の againSet ∪ romanticSet と同じ範囲）。
    // 片側だけの「行きたい」は入らない（mutualMatchSet は往復の記録があるものだけ返す）。
    (async () => {
      const { mutualMatchSet } = await import('./matchPairs');
      const [a, r] = await Promise.all([mutualMatchSet(meId, 'again'), mutualMatchSet(meId, 'romantic')]);
      r.forEach((id) => a.add(id));
      return a;
    })(),
    (async () => { const { blockedSetOf } = await import('./dmBlock'); return blockedSetOf(meId); })(),
  ]);

  // 1. ゴル友（/api/friends は相互に書き込むので自分側だけ見れば足りる）
  const friends = new Set(me?.friendIds || []);
  for (const id of cands) if (friends.has(id)) allowed.add(id);

  // 2. マッチ（お互いが選び合った相手）
  for (const id of cands) if (matched.has(id)) allowed.add(id);

  // 「ごめんなさい」の遮断は最後に効かせる（どの条件にも優先する）
  blocked.forEach((id) => allowed.delete(id));
  return allowed;
}

// 単体判定。chatId は互換のため受け取るが、もう判定には使わない
// （「受信済みスレッドへの返信」の例外は 2026-10-13 に廃止）。
export async function canDm(meId: string, otherId: string, _chatId?: string): Promise<boolean> {
  if (!meId || !otherId || meId === otherId) return false;
  // 遮断はどの許可よりも強い。ここで先に落とす。
  if (meId !== ADMIN_MANAGER_ID && otherId !== ADMIN_MANAGER_ID) {
    const { isBlocked } = await import('./dmBlock');
    if (await isBlocked(meId, otherId)) return false;
  }
  const set = await dmAllowedSet(meId, [otherId]);
  return set.has(otherId);
}

// UI表示用の説明文（送れない理由の案内）。クライアントでそのまま出す。
// 絵文字は実行時に作る（lib の定数文字列に直接書くと SWC の折りたたみでエスケープのまま届くことがある）
const HEART = String.fromCodePoint(0x1f498);   // 💘
const QMARK = String.fromCodePoint(0x2753);    // ❓
export const DM_POLICY_MSG = `メッセージを送れるのは「ゴル友（QR・友達申請でつながった人）」「レビューでお互いに『行きたい』『${HEART} 気になる』を選んだ相手」、それと運営（管理人）だけです。募集の主催者への連絡は、募集ページの「${QMARK} 主催者に質問」からどうぞ`;
