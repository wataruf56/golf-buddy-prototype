import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import { areasForStations, stationsLabel } from './stations';
import { createThread, officialOf, type OfficialSlot } from './officialThread';
import type { Round, User } from './types';

// 管理者の代理ラウンド募集（ドライバー先行型）。
//
// 【何をする機能か】
// 運営が「車を出せる人」を先に見つけ、その人が拾える駅まで決めたうえで、
// 残りの参加者を代わりに集める。募集を立てるのが面倒で止まっている人の
// 代わりに、運営が枠だけ用意する。
//
// 【なぜドライバーが先か】
// ゴルフ場は駅から遠く、車の有無が最大の壁。先に参加者を集めてから
// 「誰か車を出せませんか」と聞くと、出せる人がいないまま解散になる。
// 車が確保できてから人を集めれば、その心配が消える。
//
// 【ドライバーが抜けたら】
// 枠は解散しない。参加者はその駅で拾ってもらう前提で集まっているので、
// **同じ駅で車を出せる別の人**に声をかけ直す。集まっている人はそのまま残る。

/** 「あとで」を押した人に、何日聞かないか。運営枠の声かけと同じ7日。 */
export const DRIVER_SNOOZE_DAYS = 7;

/** ドライバーに聞く一言。ラウンドの可否ではなく「車を出せるか」だけを聞く。 */
export const DRIVER_ASK_TITLE = 'あなたの車で、駅から一緒に行きませんか？';
export const DRIVER_ASK_BODY =
  '拾える駅を選ぶだけで、運営が残りの参加者を集めます。\n日程とコースは、集まってから決められます。';

/** この人にドライバーの声かけを出してよいか。 */
export function canAskDriver(u: User | null | undefined): boolean {
  if (!u) return false;
  // 「車あり」と答えた人にだけ聞く。持っていない人に聞くのは意味がない。
  if (u.car !== 'have') return false;
  const d = u.driverPickup;
  if (!d) return true;
  // すでに駅を登録している人には聞かない。
  if (d.stations && d.stations.length) return false;
  // 「あとで」の期間中は聞かない。
  if (d.snoozeUntil && d.snoozeUntil > Date.now()) return false;
  return true;
}

/**
 * ドライバー1人ぶんの枠を組み立てる。
 *
 * 男女2:2は**ドライバーを含む**。ドライバーが男性なら、募集するのは男性1・女性2。
 * ドライバー本人の席は role:'driver' の枠にして、後から入る人が座れないようにする。
 */
export function slotsForDriver(driverGender?: string): OfficialSlot[] {
  const male = driverGender === 'male' ? 1 : 2;
  const female = driverGender === 'female' ? 1 : 2;
  return [
    { id: 'driver', gender: (driverGender === 'female' ? 'female' : 'male') as any, count: 1, role: 'driver',
      note: '車を出す人' },
    ...(male > 0 ? [{ id: 'male', gender: 'male' as const, count: male, role: 'any' as const }] : []),
    ...(female > 0 ? [{ id: 'female', gender: 'female' as const, count: female, role: 'any' as const }] : []),
  ];
}

/**
 * ドライバーの回答から枠を自動で立てて、その人を最初のメンバーとして入れる。
 *
 * 枠を人手で作らせないのがこの機能の肝。駅を選んだ瞬間に募集が始まる。
 */
export async function createThreadForDriver(
  driver: User, stations: string[],
): Promise<{ ok: true; round: Round } | { ok: false; message: string }> {
  const place = stations[0];
  const areas = areasForStations(stations);
  const label = stationsLabel(stations);

  const res = await createThread({
    pattern: 'meetup',
    title: `🚗 ${label}から一緒に行きませんか`,
    meetPlace: place,
    slots: slotsForDriver(driver.gender),
    askLicense: false,
    prompt: {
      popupTitle: `${label}から、車で一緒に行きませんか？`,
      popupBody:
        `${driver.displayName || 'メンバー'}さんが車を出してくれます。\n`
        + '日程とコースは、集まってから決めます。',
      // 駅そのものでは会員と突き合わせられないので、駅→都道府県に落として絞る。
      targetAreas: areas,
      targetGender: '',
      snoozeDays: DRIVER_SNOOZE_DAYS,
    },
  });
  if (!res.ok) return res;

  // 駅とドライバーを枠に刻む。抜けたときの再募集で使う。
  const o = officialOf(res.round)!;
  await db.updateRound(res.round.id, {
    applicantIds: [driver.id],
    currentCount: 1,
    official: { ...o, stations, driverId: driver.id, slotOf: { [driver.id]: 'driver' } },
  } as any);

  return { ok: true, round: { ...res.round, applicantIds: [driver.id], currentCount: 1 } as Round };
}

/**
 * 会員の「車を出せる駅」を保存する。
 * 空配列は「やっぱりやめる」ではなく、登録の取り消しとして扱う。
 */
export async function saveDriverStations(userId: string, stations: string[]): Promise<string[]> {
  const clean = Array.from(new Set((stations || []).map((s) => String(s).slice(0, 20)))).slice(0, 12);
  await db.upsertUser({ id: userId, driverPickup: { stations: clean, at: Date.now() } } as any);
  return clean;
}

/** 「あとで」。しばらく聞かない。 */
export async function snoozeDriverAsk(userId: string): Promise<void> {
  await db.upsertUser({
    id: userId,
    driverPickup: { stations: [], at: Date.now(), snoozeUntil: Date.now() + DRIVER_SNOOZE_DAYS * 86400000 },
  } as any);
}

/**
 * ドライバーが抜けた枠の代わりを探す。
 *
 * 解散させないのがここの目的。同じ駅で車を出せると登録している人を返す。
 * すでにその枠にいる人は除く（自分に声はかけない）。
 */
export async function findReplacementDrivers(round: Round, limit = 30): Promise<User[]> {
  const o = officialOf(round);
  const want = new Set(o?.stations || []);
  if (!want.size) return [];
  const inRound = new Set([...(round.applicantIds || []), round.hostId]);

  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const snap = await adb.collection('users').where('car', '==', 'have').limit(500).get();
    const out: User[] = [];
    for (const d of snap.docs) {
      const u = { id: d.id, ...(d.data() || {}) } as User;
      if (inRound.has(u.id)) continue;
      if (String(u.id).startsWith('test_')) continue;
      const mine = u.driverPickup?.stations || [];
      if (!mine.some((s) => want.has(s))) continue;
      out.push(u);
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error('[proxyRecruit] findReplacementDrivers failed', (e as Error).message);
    return [];
  }
}

/**
 * ドライバーが抜けたときの後始末。
 * 枠に「ドライバーを探している」印を付け、条件に合う車持ちへ声をかける。
 */
export async function onDriverLeft(round: Round, leftUserId: string): Promise<number> {
  const o = officialOf(round);
  if (!o || !o.driverId || o.driverId !== leftUserId) return 0;

  // driverId を undefined にしない。updateRound は undefined を捨てるうえ、
  // Firestore は入れ子の undefined を受け付けずに例外を投げる。
  // 例外が出るとこの関数ごと落ちて、再募集の通知もチャットも流れない。
  // 「いない」は空文字で表す（このリポジトリで消したいときの決まりごと）。
  await db.updateRound(round.id, {
    official: { ...o, driverId: '', driverWanted: true },
  } as any);

  const label = stationsLabel(o.stations || []);
  // 中にいる人へは先に伝える。候補が1人も見つからなくても、
  // 「運営が代わりを探している」ことが見えないと、残された人は何が起きたか分からない。
  try {
    await db.addRoundMessage(round.id, ADMIN_MANAGER_ID,
      `🚗 車を出せる方を、運営で探しています（${label}）。\n決まりしだいここでお知らせします。`);
  } catch { /* noop */ }

  const cands = await findReplacementDrivers(round);
  if (!cands.length) return 0;

  const text = `🚗 「${round.title}」で車を出せる方を探しています（${label}）`;
  const link = `/round/${round.id}`;
  try {
    const { addNotification } = await import('./notifications');
    const { isNotifyEnabled } = await import('./notifyPrefs');
    const { pushTo, liffUrl } = await import('./linePush');
    await Promise.all(cands.map(async (u) => {
      await addNotification(u.id, 'applyApproved', text, link);
      if (isNotifyEnabled(u as any, 'applyApproved')) {
        pushTo(u.id, text, liffUrl(link), 'proxy_driver_wanted').catch(() => {});
      }
    }));
  } catch (e) {
    console.error('[proxyRecruit] notify replacement failed', (e as Error).message);
  }

  return cands.length;
}
