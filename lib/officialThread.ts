import { db } from './db';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID } from './adminManagerId';
import type { Round } from './types';
import {
  DEFAULT_EXPIRE_DAYS, defaultSlots, isActiveStage, officialOf as of, titleFor,
  type OfficialInfo, type OfficialPattern, type OfficialSlot, type SlotGender, type SlotRole,
} from './officialShared';

// 公式スレッドのうち、**Firestore に触る部分**だけをここに置く。
// 型・ラベル・枠の集計・参加可否は officialShared.ts（クライアントからも読む）。
// lib/db と lib/firebase は server-only なので、混ぜるとクライアントのビルドが落ちる。
export * from './officialShared';

// ── いま動いている1本（同時募集はしない） ──────────────────
/**
 * いま動いている公式スレッドを返す。**同時に走らせるのは1本まで**という運用なので、
 * 見つかった最初の1件でよい。（複数を並行させると声かけがぶつかり、
 * どちらも中途半端に埋まって成立しない、が起きやすい。）
 */
export async function getActiveThread(): Promise<Round | null> {
  const adb = getAdminDb() as any;
  if (!adb) return null;
  try {
    const snap = await adb.collection('rounds').where('hostId', '==', ADMIN_MANAGER_ID).limit(50).get();
    const rounds = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) } as Round));
    const active = rounds
      .filter((r: Round) => { const o = of(r); return !!o && isActiveStage(o.stage); })
      .sort((a: Round, b: Round) => (b.createdAt || 0) - (a.createdAt || 0));
    return active[0] || null;
  } catch { return null; }
}

export async function listThreads(limit = 60): Promise<Round[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const snap = await adb.collection('rounds').where('hostId', '==', ADMIN_MANAGER_ID).limit(limit).get();
    return snap.docs
      .map((d: any) => ({ id: d.id, ...(d.data() || {}) } as Round))
      .filter((r: Round) => !!of(r))
      .sort((a: Round, b: Round) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}

export async function createThread(input: {
  pattern: OfficialPattern;
  title?: string;
  meetPlace?: string;
  slots?: OfficialSlot[];
  askLicense?: boolean;
  expireDays?: number;
}): Promise<{ ok: true; round: Round } | { ok: false; message: string }> {
  // 同時に走らせない。動いているものがあれば作らせない。
  const active = await getActiveThread();
  if (active) {
    return { ok: false, message: `「${active.title}」がまだ動いています。先にそちらを終わらせてください。` };
  }

  const pattern = input.pattern;
  const place = (input.meetPlace || '').trim().slice(0, 20) || undefined;
  const slots = (input.slots && input.slots.length ? input.slots : defaultSlots(pattern, place))
    .slice(0, 6)
    .map((s, i) => ({
      id: s.id || `s${i + 1}`,
      gender: (['male', 'female', 'any'].includes(s.gender) ? s.gender : 'any') as SlotGender,
      count: Math.max(1, Math.min(20, Math.floor(Number(s.count) || 1))),
      role: (['any', 'driver', 'rider'].includes(s.role) ? s.role : 'any') as SlotRole,
      minDrivers: Math.max(0, Math.min(20, Math.floor(Number(s.minDrivers) || 0))) || undefined,
      note: s.note ? String(s.note).slice(0, 60) : undefined,
    }));

  const seats = slots.reduce((a, s) => a + s.count, 0);
  const official: OfficialInfo = {
    pattern,
    slots,
    meetPlace: place,
    askLicense: input.askLicense !== undefined ? !!input.askLicense : pattern === 'women',
    expiresAt: Date.now() + Math.max(1, Math.min(60, input.expireDays || DEFAULT_EXPIRE_DAYS)) * 86400000,
    stage: 'recruiting',
  };

  const round: Omit<Round, 'id'> = {
    hostId: ADMIN_MANAGER_ID,
    hostCohort: 'a',
    title: (input.title || titleFor(pattern, place)).slice(0, 60),
    eventType: 'golf',
    // 日程もコースも決めずに出す。ここがこの企画の肝。
    type: 'flexible',
    dateType: 'range',
    dateRange: '日程はこれから決めます',
    // 運営は参加者に数えないので、定員＝枠の合計そのもの。
    maxSpots: seats,
    spotsMale: slots.filter((s) => s.gender === 'male').reduce((a, s) => a + s.count, 0),
    spotsFemale: slots.filter((s) => s.gender === 'female').reduce((a, s) => a + s.count, 0),
    spotsAny: slots.filter((s) => s.gender === 'any').reduce((a, s) => a + s.count, 0),
    currentCount: 0,
    applicantIds: [],
    levelCondition: '誰でも',
    status: 'open',
    isCompetition: false,
    isOfficial: true,
    createdAt: Date.now(),
    ...(place ? { meetingInfo: `🚉 ${place}集合` } : {}),
    official,
  } as any;

  const created = await db.createRound(round);
  return { ok: true, round: created };
}

