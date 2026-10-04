import 'server-only';
import { db } from './db';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID, SYSTEM_SENDER_ID } from './adminManagerId';
import { getCohort } from './ageGate';
import { AVAIL_ROOM_MIN, availRoomTitle, dateLabel, needsStation } from './availabilityShared';
import type { Round, User } from './types';

// 「行ける日」の集まり（2026-09-27・本人判断の軽い版）。
//
//   ・同じ日に「行ける」を押した人が 4人以上 になったら、その日のチャット部屋を作る。
//     その日のメンバーだけで話せる。
//   ・5人目からは「👋 〇〇さんが参加しました」を流して合流する。
//   ・日を外した人は部屋からも外れる（「行けなくなりました」を流す）。
//
// 【なぜラウンドとして作るか】
// 運営枠（officialThread）と同じ理由。チャット・未読・通知・写真・配車ボードが
// 既存のまま乗る。あとで日程・コースを決めれば、そのままラウンドになる。
// 部屋は `availDate` を持つラウンドで、主催は運営（ADMIN_MANAGER_ID）。
// id は日付から決める（avail_2026-10-07）ので、同時に押されても部屋が2つできない。
//
// 【数えない人】
// 行ける日の一覧と同じ基準：40代以上・年齢未設定・性別未設定・最寄り駅なし・停止中。
// テスト垢と一般会員は別の部屋（availTest）。混ざると本番の会員がテストに巻き込まれる。

const ROUNDS = 'rounds';
const AVAIL = '_availability';

export function roomIdFor(date: string, test: boolean): string {
  return `avail_${date}${test ? '_test' : ''}`;
}

async function testChecker(): Promise<(id: string) => boolean> {
  const cfg = await import('./testAccounts').then((m) => m.getTestAccountConfig()).catch(() => null);
  const tset = new Set((cfg?.accounts || []).map((a: any) => a.id));
  return (id: string) => !!id && (id.startsWith('test_') || tset.has(id));
}

/** その日に「行ける」を出していて、部屋に入れる人（本人を含む）。 */
async function eligibleFor(date: string, test: boolean, isTest: (id: string) => boolean): Promise<User[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  const snap = await adb.collection(AVAIL).where('dates', 'array-contains', date).limit(500).get();
  const ids: string[] = snap.docs.map((d: any) => (d.data() || {}).userId || d.id);
  if (!ids.length) return [];
  const [users, banned] = await Promise.all([
    db.listUsers(ids),
    import('./banAccess').then((m) => m.getBannedIdSet()).catch(() => new Set<string>()),
  ]);
  return users.filter((u) => u && !banned.has(u.id) && !(u as any).banned
    && isTest(u.id) === test
    && getCohort(u.age) === 'a'
    && (u.gender === 'male' || u.gender === 'female')
    && !needsStation(u));
}

function memberLine(u: User | undefined): string {
  const g = u?.gender === 'male' ? '男性' : u?.gender === 'female' ? '女性' : '';
  const a = u?.age ? `${u.age}歳` : '';
  const c = u?.car === 'have' ? '車あり' : '';
  const tail = [g, a, c].filter(Boolean).join('・');
  return `・${u?.displayName || '？'}さん${tail ? `（${tail}）` : ''}`;
}

async function notifyMembers(ids: string[], users: Record<string, User>, text: string, link: string, kind: string): Promise<void> {
  const { addNotification } = await import('./notifications');
  const { isNotifyEnabled } = await import('./notifyPrefs');
  const { pushTo, liffUrl } = await import('./linePush');
  await Promise.all(ids.map(async (uid) => {
    await addNotification(uid, 'applyApproved', text, link).catch(() => {});
    if (isNotifyEnabled(users[uid], 'applyApproved')) pushTo(uid, text, liffUrl(link), kind).catch(() => {});
  }));
}

/**
 * 「行ける」を押した直後。部屋があれば合流し、なければ人数を見て作る。
 * 失敗しても例外は投げない（保存そのものは済んでいる）。
 */
export async function onAvailabilityAdded(me: User, date: string): Promise<void> {
  try {
    const adb = getAdminDb() as any;
    if (!adb) return;
    const isTest = await testChecker();
    const test = isTest(me.id);
    const roomId = roomIdFor(date, test);
    const existing = await db.getRound(roomId);

    if (existing) {
      if ((existing.applicantIds || []).includes(me.id)) return;
      if (!(await eligibleFor(date, test, isTest)).some((u) => u.id === me.id)) return;   // 数えない人は入れない
      const applicantIds = [...(existing.applicantIds || []), me.id];
      await db.updateRound(roomId, { applicantIds, currentCount: applicantIds.length, maxSpots: applicantIds.length } as any);
      // 「👋 〇〇さんが参加しました」＋管理人の歓迎（募集への参加と同じ2行）
      const { postJoinMessages } = await import('./joinWelcome');
      await postJoinMessages({ ...existing, applicantIds } as Round, me, applicantIds.length, 0);
      const l = dateLabel(date);
      await notifyMembers([me.id], { [me.id]: me },
        `💬 ${l.md}（${l.w}）に行ける人のチャットに参加しました（${applicantIds.length}人）`, `/round/${roomId}/chat`, 'avail_room_join');
      return;
    }

    const members = await eligibleFor(date, test, isTest);
    if (members.length < AVAIL_ROOM_MIN) return;
    if (!members.some((u) => u.id === me.id)) return;
    const ids = members.map((u) => u.id);
    const l = dateLabel(date);
    const round: Record<string, unknown> = {
      hostId: ADMIN_MANAGER_ID,
      hostCohort: 'a',
      title: availRoomTitle(date),
      eventType: 'golf',
      // 日は決まっているがコースはこれから。運営は参加者に数えない（運営枠と同じ）
      type: 'flexible',
      dateType: 'fixed',
      date,
      startTime: '',
      maxSpots: ids.length,
      spotsMale: 0, spotsFemale: 0, spotsAny: ids.length,
      currentCount: ids.length,
      applicantIds: ids,
      pendingApplicantIds: [],
      invitedIds: [],
      levelCondition: '誰でも',
      status: 'open',
      isCompetition: false,
      isOfficial: true,
      createdAt: Date.now(),
      availDate: date,
      ...(test ? { availTest: true } : {}),
    };
    try {
      await adb.collection(ROUNDS).doc(roomId).create(round);   // 既にあれば失敗する（同時に押されたとき）
    } catch {
      // 先に誰かが作った。合流の経路へ
      return onAvailabilityAdded(me, date);
    }
    const users: Record<string, User> = {};
    members.forEach((u) => { users[u.id] = u; });
    const intro = ids.map((uid) => memberLine(users[uid])).join('\n');
    await db.addRoundMessage(roomId, ADMIN_MANAGER_ID,
      `🎉 ${l.md}（${l.w}）に行ける人が${ids.length}人になりました。\n\n${intro}\n\n`
      + 'この日に回るかどうか、コースや集合場所をここで相談してください。'
      + '人が増えたらこのチャットに合流します。行けなくなったら「行ける日」からその日を外してください。');
    await notifyMembers(ids, users,
      `🎉 ${l.md}（${l.w}）に行ける人が${ids.length}人集まりました。チャットで相談しましょう`, `/round/${roomId}/chat`, 'avail_room_open');
  } catch (e) {
    console.error('[availRooms] add failed (non-fatal)', (e as Error).message);
  }
}

/** 日を外した直後。部屋から外して、その旨を流す。 */
export async function onAvailabilityRemoved(me: User, date: string): Promise<void> {
  try {
    const isTest = await testChecker();
    const roomId = roomIdFor(date, isTest(me.id));
    const existing = await db.getRound(roomId);
    if (!existing || !(existing.applicantIds || []).includes(me.id)) return;
    // 除外と同じ経路で外す（組み分け・配車・希望の痕跡も一緒に消える）
    await db.kickApplicant(roomId, me.id);
    const left = (existing.applicantIds || []).filter((id) => id !== me.id).length;
    await db.updateRound(roomId, { currentCount: left, maxSpots: Math.max(left, 1) } as any);
    await db.addRoundMessage(roomId, SYSTEM_SENDER_ID, `👋 ${me.displayName || 'メンバー'}さんが行けなくなりました（この日を外しました）`);
  } catch (e) {
    console.error('[availRooms] remove failed (non-fatal)', (e as Error).message);
  }
}

/** 自分が入っている部屋（日付 → 部屋）。行ける日の画面で「この日のチャットへ」を出すため。 */
export async function roomsFor(userId: string, dates: string[]): Promise<Record<string, { id: string; count: number }>> {
  const out: Record<string, { id: string; count: number }> = {};
  const adb = getAdminDb() as any;
  if (!dates.length || !adb) return out;
  // 自分が入っている募集を1回で引いて、部屋（availDate つき）だけ拾う（日付ごとに読まない）
  const snap = await adb.collection(ROUNDS).where('applicantIds', 'array-contains', userId).limit(200).get();
  snap.docs.forEach((d: any) => {
    const r = d.data() || {};
    if (r.availDate && dates.includes(r.availDate) && r.status !== 'completed') {
      out[r.availDate] = { id: d.id, count: (r.applicantIds || []).length };
    }
  });
  return out;
}

/**
 * 部屋がまだ無いのに人数がそろっている日を探して作る（運営用）。
 * 基準人数を下げたとき（4→3）など、誰かが押し直すまで部屋ができないのを埋める。
 */
export async function sweepRooms(): Promise<{ created: string[]; checked: number }> {
  const adb = getAdminDb() as any;
  if (!adb) return { created: [], checked: 0 };
  const isTest = await testChecker();
  const snap = await adb.collection(AVAIL).where('updatedAt', '>', 0).limit(2000).get();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const byDate: Record<string, Set<string>> = {};
  snap.docs.forEach((d: any) => {
    const x = d.data() || {}; const uid: string = x.userId || d.id;
    (Array.isArray(x.dates) ? x.dates : []).forEach((dt: string) => { if (dt >= today) (byDate[dt] = byDate[dt] || new Set()).add(uid); });
  });
  const created: string[] = [];
  let checked = 0;
  for (const [date, uids] of Object.entries(byDate)) {
    for (const test of [false, true]) {
      checked += 1;
      if (await db.getRound(roomIdFor(date, test))) continue;
      const members = await eligibleFor(date, test, isTest);
      if (members.length < AVAIL_ROOM_MIN) continue;
      const first = members.find((u) => uids.has(u.id)) || members[0];
      await onAvailabilityAdded(first, date);
      if (await db.getRound(roomIdFor(date, test))) created.push(roomIdFor(date, test));
    }
  }
  return { created, checked };
}

/** その日に「行ける」を出している人数（部屋ができる前の「あと何人」表示用）。本人と同じ側（テスト／一般）だけ。 */
export async function countEligible(me: User, date: string): Promise<number> {
  try {
    const isTest = await testChecker();
    return (await eligibleFor(date, isTest(me.id), isTest)).length;
  } catch { return 0; }
}
