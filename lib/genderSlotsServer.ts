import 'server-only';
import { db } from './db';
import type { Round, User, Gender } from './types';
import { memberGendersForSlots, slotFullFor, slotGenderLabel, type SlotGender } from './genderSlots';

/** 枠の判定に要る人（参加確定）を DB から引く。 */
export async function membersAsUsers(round: Round): Promise<User[]> {
  const ids = Array.from(new Set((round.applicantIds || []).filter(Boolean)));
  const users = await Promise.all(ids.map((id) => db.getUser(id).catch(() => null)));
  return users.filter(Boolean) as User[];
}

export async function memberGendersFromDb(round: Round): Promise<Array<Gender | undefined>> {
  return memberGendersForSlots(round, await membersAsUsers(round));
}

/**
 * 空き待ちの人に「空きが出ました」を知らせる。
 * before → after で、その性別の枠が「満員 → 空きあり」に変わったときだけ（辞退・外す・主催者が枠を増やした）。
 * 先着ではないので、空き待ちの登録は消さない（本人が参加申請したときに join 側で消す）。
 */
export async function notifyWaitlistIfOpened(before: Round, afterRound?: Round | null): Promise<void> {
  try {
    const after = afterRound || (await db.getRound(before.id));
    if (!after || !(after.waitlist || []).length) return;
    if ((after.currentCount || 0) >= (after.maxSpots || 0)) return;   // 全体が満員なら空いていない
    const [usersB, usersA] = await Promise.all([membersAsUsers(before), membersAsUsers(after)]);
    for (const g of ['male', 'female'] as SlotGender[]) {
      const waiting = (after.waitlist || []).filter((e) => e.gender === g);
      if (!waiting.length) continue;
      const wasFull = slotFullFor(before, usersB, g);
      const nowFull = slotFullFor(after, usersA, g);
      if (!wasFull || nowFull) continue;
      const link = `/round/${after.id}`;
      const text = `🔔 「${after.title}」の${slotGenderLabel(g)}枠に空きが出ました。いま参加申請できます（先着ではありません）。`;
      const ids = waiting.map((e) => e.userId);
      const { addNotificationMany } = await import('./notifications');
      await addNotificationMany(ids, 'waitlist', text, link);
      const { isNotifyEnabled } = await import('./notifyPrefs');
      const { pushToMany, liffUrl } = await import('./linePush');
      const us = await Promise.all(ids.map((id) => db.getUser(id).catch(() => null)));
      const lineIds = ids.filter((_, i) => us[i] && isNotifyEnabled(us[i] as any, 'waitlist'));
      if (lineIds.length) await pushToMany(lineIds, text, liffUrl(link), 'waitlist');
    }
  } catch (e) {
    console.warn('[waitlist] notify failed', (e as Error).message);
  }
}
