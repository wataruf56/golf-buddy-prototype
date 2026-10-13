import 'server-only';
import { db } from './db';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import { isRoundHost } from './roundHost';
import type { Round, RoundThread, Message } from './types';

// 「❓ 主催者に質問」＝募集のグループチャットの中の**非公開スレッド**（2026-10-13）。
// 以前は募集の主催者に 1対1 の DM を送れたが、その相手がラウンド終了後も友達リストに残って
// ずっと DM できてしまった。DM は「ゴル友・マッチ」だけ（lib/dmPolicy）にし、募集まわりの
// 連絡はこのスレッドで行う。
//
//   - スレッド = rounds/{id}/threads に kind:'question' / memberIds / askerId を持つ RoundThread
//   - 読める・書けるのは memberIds（主催者＋共同管理者＋質問した人）だけ。他の参加者には見えない
//   - 1つの募集につき、質問する人1人あたり1スレッド（あれば再利用）
//   - 立てられる人：主催者以外で、承認済み／申請中／招待中／空き待ち、または募集中(open)の募集を見ている人
//     主催者側からも「❓ 個別に連絡」で、申請中・参加確定・招待中・空き待ち・取りやめた人に向けて立てられる
//   - 参加者でない人（申請中など）がグループチャットを開くと、自分の質問スレッドだけが見える「限定表示」になる
//     （/api/rounds/[id]/chat の limited:true）

export const QUESTION_EMOJI = String.fromCodePoint(0x2753); // ❓（lib の定数に絵文字を直接書かない）

export const isQuestionThread = (t: RoundThread | undefined | null): boolean => !!t && t.kind === 'question';
export const isPrivateThread = (t: RoundThread | undefined | null): boolean => !!t && Array.isArray(t.memberIds) && t.memberIds.length > 0;

/** 公開スレッド、または自分が memberIds に入っている非公開スレッドだけ true */
export function canSeeThread(t: RoundThread, viewerId: string): boolean {
  if (!isPrivateThread(t)) return true;
  return (t.memberIds || []).includes(viewerId);
}

/** 閲覧者に見せてよいスレッド＋そのメッセージに絞る（主催者も、自分が入っていない質問スレッドは見えない） */
export function filterForViewer(threads: RoundThread[], messages: Message[], viewerId: string, opts?: { onlyPrivate?: boolean }) {
  const visible = threads.filter((t) => canSeeThread(t, viewerId) && (!opts?.onlyPrivate || isPrivateThread(t)));
  const ids = new Set(visible.map((t) => t.id));
  const hidden = new Set(threads.filter((t) => !ids.has(t.id)).map((t) => t.id));
  const msgs = messages.filter((m) => {
    if (!m.threadId) return !opts?.onlyPrivate;          // 本流：限定表示では出さない
    if (hidden.has(m.threadId)) return false;             // 見えないスレッドの発言
    if (opts?.onlyPrivate) return ids.has(m.threadId);    // 限定表示：自分の質問スレッドだけ
    return true;                                          // 公開スレッド／削除済みスレッドの残骸はそのまま
  });
  return { threads: visible, messages: msgs };
}

const hostIdsOf = (r: Round): string[] => Array.from(new Set([r.hostId, ...(r.coHostIds || [])].filter(Boolean)));

/** その人が「質問する側」としてこの募集に関わっているか（承認済み／申請中／招待中／空き待ち／取りやめた人） */
export function isRelatedToRound(r: Round, uid: string): boolean {
  if (!uid) return false;
  if ((r.applicantIds || []).includes(uid)) return true;
  if ((r.pendingApplicantIds || []).includes(uid)) return true;
  if ((r.invitedIds || []).includes(uid)) return true;
  if ((r.waitlist || []).some((w) => w.userId === uid)) return true;
  if ((r.cancellations || []).some((c) => c.userId === uid)) return true;
  if ((r.rejectedApplicants || []).some((c) => c.userId === uid)) return true;
  return false;
}

/** 閲覧者がこの募集で「❓ 主催者に質問」を立ててよいか（既存スレッドがあれば常に開ける） */
export function canAskHost(r: Round, uid: string): boolean {
  if (!uid || isRoundHost(r, uid)) return false;
  if ((r as any).deleted) return false;
  if (isRelatedToRound(r, uid)) return true;
  // 募集中なら、見に来た人は誰でも聞ける（申し込む前の質問）。運営枠の募集中（顔ぶれを伏せている段階）も可
  return r.status === 'open' && !(r as any).heldCancelledAt;
}

export function findQuestionThread(threads: RoundThread[], askerId: string): RoundThread | undefined {
  return threads.find((t) => t.kind === 'question' && t.askerId === askerId);
}

/**
 * 質問スレッドを用意する（あれば再利用）。
 *   by      … 操作した人（質問する本人、または主催者）
 *   askerId … 質問する側の人（主催者が立てるときは相手の userId）
 */
export async function ensureQuestionThread(round: Round, askerId: string, by: string): Promise<{ thread: RoundThread; created: boolean }> {
  const threads = await db.listRoundThreads(round.id);
  const existing = findQuestionThread(threads, askerId);
  if (existing) {
    // 共同管理者が後から増えたときに取り残されないよう、主催者側の顔ぶれは常に最新にそろえる
    const want = Array.from(new Set([...hostIdsOf(round), askerId]));
    const have = new Set(existing.memberIds || []);
    if (want.some((id) => !have.has(id))) {
      const memberIds = Array.from(new Set([...(existing.memberIds || []), ...want]));
      try {
        const { getAdminDb } = await import('./firebase');
        const adb = getAdminDb() as any;
        if (adb) await adb.collection('rounds').doc(round.id).collection('threads').doc(existing.id).set({ memberIds }, { merge: true });
      } catch { /* 取れなければ従来の顔ぶれのまま */ }
      return { thread: { ...existing, memberIds }, created: false };
    }
    return { thread: existing, created: false };
  }
  const asker = await db.getUser(askerId);
  const askerName = asker?.displayName || 'メンバー';
  const name = by === askerId
    ? `${QUESTION_EMOJI} ${askerName}さんからの質問`
    : `${QUESTION_EMOJI} ${askerName}さんへの連絡`;
  const memberIds = Array.from(new Set([...hostIdsOf(round), askerId]));
  const thread = await db.createRoundThread(round.id, name.slice(0, 40), by, { kind: 'question', memberIds, askerId });
  return { thread, created: true };
}

/**
 * 質問スレッドに発言があったときの通知。
 *   質問した人の発言 → 主催者・共同管理者に「❓ 〇〇さんから質問」
 *   主催者側の発言   → 質問した人に「💬 主催者から返事」
 * アプリ内お知らせ＋LINE（通知設定「📣 メンション」に従う）＋Web push。宛先の隔離は各 helper が自動で行う（lib/testIsolation）。
 */
export async function notifyQuestionThread(round: Round, thread: RoundThread, senderId: string, senderName: string, text: string): Promise<void> {
  const members = (thread.memberIds || []).filter((id) => id && id !== senderId && id !== ADMIN_MANAGER_ID);
  if (!members.length) return;
  const preview = text ? (text.length > 60 ? text.slice(0, 60) + '…' : text) : String.fromCodePoint(0x1f4f7) + ' 画像';
  const chatPath = `/round/${round.id}/chat?thread=${encodeURIComponent(thread.id)}`;
  const fromAsker = senderId === thread.askerId;
  const title = round.title || 'ラウンド';
  const inApp = fromAsker
    ? `${QUESTION_EMOJI} ${senderName}さんから「${title}」の主催者への質問：${preview}`
    : `${String.fromCodePoint(0x1f4ac)} 「${title}」の主催者 ${senderName}さんから返事が届きました：${preview}`;
  const line = fromAsker
    ? `${QUESTION_EMOJI}【ゴルトモ】「${title}」に ${senderName}さんから質問が届きました\n「${preview}」\nグループチャットの中の、主催者とその人だけが読めるスレッドです。`
    : `${String.fromCodePoint(0x1f4ac)}【ゴルトモ】「${title}」の主催者 ${senderName}さんから、あなたの質問に返事が届きました\n「${preview}」`;
  const users = (await Promise.all(members.map((id) => db.getUser(id)))).filter(Boolean) as any[];
  const { addNotificationMany } = await import('./notifications');
  addNotificationMany(users.map((u) => u.id), 'mention', inApp, chatPath).catch(() => {});
  const { isNotifyEnabled } = await import('./notifyPrefs');
  const targets = users.filter((u) => isNotifyEnabled(u, 'mention')).map((u) => u.id);
  if (targets.length) {
    const { pushToMany, liffUrl } = await import('./linePush');
    const { webPushToMany } = await import('./webPush');
    pushToMany(targets, line, liffUrl(chatPath), 'mention').catch(() => {});
    webPushToMany(targets, fromAsker ? `${QUESTION_EMOJI} ${senderName}さんから質問` : `${String.fromCodePoint(0x1f4ac)} 主催者から返事`, preview, chatPath, `question-${round.id}-${thread.id}`).catch(() => {});
  }
}
