import 'server-only';
import { db } from './db';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import { DEFAULT_FILLED_MESSAGE, licenseSummary, type OfficialInfo } from './officialShared';
import type { Round } from './types';

/**
 * 運営枠に人がそろった瞬間の処理。
 *
 * 【なぜ切り出したか】
 * そろう経路が2つある（募集カードの「参加する」と、声かけポップアップのワンタップ）。
 * 片方にしか置いていなかったため、ポップアップ経由で最後の1人が入ると
 * 誰にも知らされないままになっていた。
 *
 * 【ここが初めて名前を出す場所】
 * 募集中は誰が入っているかを伏せている。だからチャットも、そろってから始まる。
 * いきなり本題（配車や予約の相談）に入らず、まず全員を紹介する。
 */
export async function onOfficialFilled(
  round: Round,
  next: OfficialInfo,
  applicantIds: string[],
): Promise<void> {
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(applicantIds)).forEach((u) => { if (u) users[u.id] = u; });
  } catch { /* 名前が引けなくても案内は流す */ }

  const { getSettings } = await import('./officialSettings');
  const st = await getSettings();

  const intro = applicantIds.map((uid) => {
    const u = users[uid];
    const g = u?.gender === 'male' ? '男性' : u?.gender === 'female' ? '女性' : '';
    const a = u?.age ? `${u.age}歳` : '';
    const tail = [g, a].filter(Boolean).join('・');
    return `・${u?.displayName || '？'}さん${tail ? `（${tail}）` : ''}`;
  }).join('\n');

  await db.addRoundMessage(round.id, ADMIN_MANAGER_ID,
    `🎉 ${applicantIds.length}人そろいました。よろしくお願いします。\n\n${intro}`);
  await db.addRoundMessage(round.id, ADMIN_MANAGER_ID, st.filledMessage || DEFAULT_FILLED_MESSAGE);

  if (next.askLicense) {
    const sum = licenseSummary(next, applicantIds, users);
    if (sum) {
      await db.addRoundMessage(round.id, ADMIN_MANAGER_ID,
        `🚗 運転免許（申し込みのときの回答）\n${sum}`);
    }
  }

  // 二重送信の防止。ここを立てるまでは何度でも流れてしまう。
  await db.updateRound(round.id, { official: { ...next, filledNotifiedAt: Date.now() } } as any);

  // 全員に知らせる。チャットが始まったことに気づいてもらう必要がある
  // （募集中はチャットへの入口自体を出していないため）。
  const { addNotification } = await import('./notifications');
  const { isNotifyEnabled } = await import('./notifyPrefs');
  const { pushTo, liffUrl } = await import('./linePush');
  const link = `/round/${round.id}/chat`;
  const text = `🎉 「${round.title}」に${applicantIds.length}人そろいました。グループチャットが始まりました`;
  await Promise.all(applicantIds.map(async (uid) => {
    await addNotification(uid, 'applyApproved', text, link);
    if (isNotifyEnabled(users[uid], 'applyApproved')) {
      pushTo(uid, text, liffUrl(link), 'official_filled').catch(() => {});
    }
  }));
}
