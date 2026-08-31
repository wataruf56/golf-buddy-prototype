import 'server-only';
import { db } from './db';
import { ADMIN_MANAGER_ID, SYSTEM_SENDER_ID } from './adminManagerId';
import type { Round, User } from './types';

// 人がグループに入ったときに、チャットへ2つ流す。
//
//   1) 入室のお知らせ  「👋 ◯◯さんが参加しました（3/4人）」
//      → senderId は 'system'。吹き出しではなく、中央のグレーの1行で出す。
//   2) 歓迎の一言      「◯◯さん、参加ありがとうございます！…」
//      → 管理人からの吹き出し。
//
// 【なぜ2つに分けるか】
// 誰が増えたかは**事実**なので、読み飛ばせる形（中央の細い行）で十分。
// 歓迎はチャットへの呼び水なので、人が話しかけている見た目にしたい。
// 1つにまとめると、事実が挨拶に埋もれて「今何人か」が読めなくなる。
//
// 【文面をどう作っているか】
// いまは**このファイルの中で組み立てています（言語モデルは通していません）**。
// このアプリには文章生成用のAPIキーが入っていないためです。
// 差し替えるときは buildWelcome() だけを置き換えれば済むようにしてあります。

export { SYSTEM_SENDER_ID };

/** プロフィールから、話しかける手がかりになる1行を作る。空の項目は入れない。 */
function profileLine(u: User): string {
  const parts = [u.area, u.scoreRange, u.frequency].filter((v) => !!v && String(v).trim());
  if (u.car === 'have') parts.push('車あり');
  return parts.length ? `🏌️ ${parts.join(' / ')}` : '';
}

/**
 * 歓迎の一言を組み立てる。
 * 呼ばれるたびに同じ文だと、4人ぶん並んだときに機械が喋っているように見える。
 * 入った順で書き出しを変えて、それらしさを出している。
 */
export function buildWelcome(user: User, round: Round, taken: number, total: number): string {
  const name = user.displayName || 'ゴルフ好きの方';
  const openers = [
    `${name}さん、参加ありがとうございます！`,
    `${name}さん、ようこそ！参加ありがとうございます。`,
    `${name}さん、参加ありがとうございます。よろしくお願いします！`,
  ];
  const head = openers[Math.max(0, taken - 1) % openers.length];

  const lines = [head];
  const p = profileLine(user);
  if (p) lines.push('', p);

  const left = Math.max(0, total - taken);
  lines.push('');
  if (left > 0) {
    lines.push(`みなさん、ひとこと声をかけてあげてください。あと${left}人で成立です。`);
  } else {
    lines.push('みなさん、ひとこと声をかけてあげてください。');
  }
  return lines.join('\n');
}

/** 「◯◯さんが参加しました」の1行。 */
function buildNotice(user: User, taken: number, total: number): string {
  const name = user.displayName || '新しい方';
  const count = total > 0 ? `（${taken}/${total}人）` : '';
  return `👋 ${name}さんが参加しました${count}`;
}

/**
 * 入室のお知らせと歓迎をチャットへ流す。
 * 失敗しても例外は投げない。チャットが書けなかったせいで参加そのものを
 * 止めてしまうと、本人には「参加できなかった」としか見えないため。
 */
export async function postJoinMessages(
  round: Round,
  user: User | null | undefined,
  taken: number,
  total: number,
): Promise<void> {
  if (!user) return;
  try {
    await db.addRoundMessage(round.id, SYSTEM_SENDER_ID, buildNotice(user, taken, total));
    await db.addRoundMessage(round.id, ADMIN_MANAGER_ID, buildWelcome(user, round, taken, total));
  } catch (e) {
    console.error('[joinWelcome] post failed (non-fatal)', (e as Error).message);
  }
}
