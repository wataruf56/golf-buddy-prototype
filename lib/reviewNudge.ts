import 'server-only';
import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase';
import { isTestId, warmTestIds } from '@/lib/testAccounts';
import { sendReviewReminder } from '@/lib/reviewFollowup';

// 管理画面「⏰ 未レビュー」（2026-10-14）。
// 完了したラウンドごとに「まだレビューしていない人（pendingReviews が残っている人）」を並べ、
//   ・この人にだけ催促 ／ ・この募集の未レビュー全員に催促 ／ ・全部の未レビューに一斉送信
// ができるようにする。文面は自動リマインドと同じ通知テンプレ「reviewReminder」（lib/reviewFollowup）。
//
// 最後に催促した時刻は (ラウンド, 人) ごとに _reviewNudges/{roundId}__{userId} に残す。
// 自動のお願い（完了時 round.reviewReminderSentAt・3日後 round.reviewFollowupSentAt）も
// 「最後に知らせた時刻」に含め、そこから12時間は同じ人に送らない（連打・二重送信の防止）。

const COLL = '_reviewNudges';
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export type NudgeSource = 'manual' | 'autoComplete' | 'autoFollowup';

export type UnreviewedMember = {
  userId: string;
  name: string;
  avatar: string;
  isTest: boolean;
  deleted: boolean;
  left: number;                       // まだレビューしていない相手の人数
  revieweeNames: string[];
  lastRemindedAt: number | null;      // 手動・自動のうち一番新しい
  lastRemindedBy: NudgeSource | null;
  manualCount: number;                // 管理画面から催促した回数
  canNudge: boolean;
  blockedReason?: string;             // canNudge=false の理由（「12時間以内に送信済み（あと3時間）」など）
};

export type UnreviewedRound = {
  roundId: string;
  title: string;
  courseName?: string;
  date?: string;
  startTime?: string;
  hostId?: string;
  hostName?: string;
  completedAt?: number;
  autoCompleteAt?: number;   // 完了時の自動のお願い
  autoFollowupAt?: number;   // 3日後の自動リマインド
  members: UnreviewedMember[];
};

type Nudge = { roundId: string; userId: string; lastAt: number; count: number; lastScope?: string };

const nudgeId = (roundId: string, userId: string) => `${roundId}__${userId}`;

function roundBaseMs(r: any): number {
  if (r.completedAt) return r.completedAt;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - 9 * 60 * 60 * 1000 : 0;
}

async function readNudges(pairs: { roundId: string; userId: string }[]): Promise<Map<string, Nudge>> {
  const out = new Map<string, Nudge>();
  const fs = getAdminDb() as any;
  if (!fs || !pairs.length) return out;
  for (let i = 0; i < pairs.length; i += 300) {
    const refs = pairs.slice(i, i + 300).map((p) => fs.collection(COLL).doc(nudgeId(p.roundId, p.userId)));
    try {
      const snaps = await fs.getAll(...refs);
      for (const s of snaps) if (s.exists) out.set(s.id, s.data() as Nudge);
    } catch (e) { console.warn('[reviewNudge] read failed', (e as Error).message); }
  }
  return out;
}

async function stampNudge(roundId: string, userId: string, now: number, scope: string, prev?: Nudge) {
  const fs = getAdminDb() as any;
  if (!fs) return;
  await fs.collection(COLL).doc(nudgeId(roundId, userId)).set({
    roundId, userId, lastAt: now, lastScope: scope, count: (prev?.count || 0) + 1,
  }, { merge: true });
}

function hoursLeft(ms: number): string {
  const h = Math.ceil(ms / (60 * 60 * 1000));
  return h <= 1 ? '1時間以内' : `あと${h}時間`;
}

/** 完了ラウンドごとの未レビュー一覧（新しい順）。days=さかのぼる日数（完了日／開催日基準）。 */
export async function listUnreviewed(days = 60, now = Date.now()): Promise<UnreviewedRound[]> {
  await warmTestIds();
  const since = now - days * DAY;
  const pendings = await db.listAllPendingReviews();

  // roundId → reviewerId → revieweeId[]
  const byRound = new Map<string, Map<string, string[]>>();
  for (const p of pendings) {
    if (!p.roundId || !p.reviewerId) continue;
    if (!byRound.has(p.roundId)) byRound.set(p.roundId, new Map());
    const m = byRound.get(p.roundId)!;
    if (!m.has(p.reviewerId)) m.set(p.reviewerId, []);
    if (p.revieweeId && !m.get(p.reviewerId)!.includes(p.revieweeId)) m.get(p.reviewerId)!.push(p.revieweeId);
  }
  if (!byRound.size) return [];

  const rounds = (await db.listRounds({ status: 'completed' })).filter((r: any) => byRound.has(r.id) && roundBaseMs(r) >= since);
  rounds.sort((a: any, b: any) => roundBaseMs(b) - roundBaseMs(a));

  const pairs: { roundId: string; userId: string }[] = [];
  const userIds = new Set<string>();
  for (const r of rounds as any[]) {
    if (r.hostId) userIds.add(r.hostId);
    for (const [uid, rees] of byRound.get(r.id)!) {
      pairs.push({ roundId: r.id, userId: uid });
      userIds.add(uid);
      rees.forEach((x) => userIds.add(x));
    }
  }
  const [nudges, users] = await Promise.all([readNudges(pairs), db.listUsers(Array.from(userIds))]);
  const uMap = new Map<string, any>(users.map((u: any) => [u.id, u]));
  const nameOf = (id: string) => uMap.get(id)?.displayName || (id.startsWith('gst_') ? 'ゲスト' : '(退会済み)');

  return (rounds as any[]).map((r) => {
    const autoComplete = Number(r.reviewReminderSentAt) || 0;
    const autoFollowup = Number(r.reviewFollowupSentAt) || 0;
    const members: UnreviewedMember[] = [];
    for (const [uid, rees] of byRound.get(r.id)!) {
      const u = uMap.get(uid);
      const n = nudges.get(nudgeId(r.id, uid));
      const cands: [number, NudgeSource][] = [[n?.lastAt || 0, 'manual'], [autoFollowup, 'autoFollowup'], [autoComplete, 'autoComplete']];
      cands.sort((a, b) => b[0] - a[0]);
      const [last, by] = cands[0];
      const deleted = !u;
      let canNudge = true;
      let blockedReason: string | undefined;
      if (deleted) { canNudge = false; blockedReason = '退会済み'; }
      else if (last && now - last < NUDGE_COOLDOWN_MS) {
        canNudge = false;
        blockedReason = `12時間以内に送信済み（${hoursLeft(NUDGE_COOLDOWN_MS - (now - last))}）`;
      }
      members.push({
        userId: uid, name: nameOf(uid), avatar: u?.avatar || '⛳', isTest: isTestId(uid), deleted,
        left: rees.length, revieweeNames: rees.map(nameOf),
        lastRemindedAt: last || null, lastRemindedBy: last ? by : null, manualCount: n?.count || 0,
        canNudge, blockedReason,
      });
    }
    members.sort((a, b) => b.left - a.left || a.name.localeCompare(b.name, 'ja'));
    return {
      roundId: r.id, title: r.title || r.courseName || 'ラウンド', courseName: r.courseName, date: r.date, startTime: r.startTime,
      hostId: r.hostId, hostName: r.hostId ? nameOf(r.hostId) : undefined, completedAt: r.completedAt,
      autoCompleteAt: autoComplete || undefined, autoFollowupAt: autoFollowup || undefined, members,
    };
  });
}

export type NudgeScope = 'user' | 'round' | 'all';

export type NudgeResult = {
  ok: boolean;
  scope: NudgeScope;
  targets: number;          // 対象になった (ラウンド, 人) の組
  notifiedUsers: number;    // 実際に送った人数（1人に複数ラウンドあっても1通）
  lineSent: number;         // うちLINE/Web pushまで送れた人数（通知設定OFFの人はアプリ内のみ）
  skippedCooldown: number;  // 12時間以内に送信済みで見送った組
  skippedOther: number;     // 退会済みなどで見送った組
};

/**
 * 催促を送る。scope=user は (roundId, userId) の1組、round はその募集の未レビュー全員、all は一覧（days以内）の全員。
 * 同じ人が複数ラウンドで未レビューのとき（scope=all）は、1人1通にまとめ、代表として一番新しいラウンドを文面・リンクに使う。
 * 送れた組には (ラウンド, 人) ごとに最後の催促時刻を記録する。
 */
export async function sendReviewNudges(
  opts: { scope: NudgeScope; roundId?: string; userId?: string; days?: number },
): Promise<NudgeResult> {
  const now = Date.now();
  const list = await listUnreviewed(opts.scope === 'all' ? (opts.days || 60) : 3650, now);
  const picked: { round: UnreviewedRound; m: UnreviewedMember }[] = [];
  for (const round of list) {
    if (opts.scope !== 'all' && round.roundId !== opts.roundId) continue;
    for (const m of round.members) {
      if (opts.scope === 'user' && m.userId !== opts.userId) continue;
      picked.push({ round, m });
    }
  }

  let skippedCooldown = 0;
  let skippedOther = 0;
  // userId → 送る組（ラウンドの新しい順に並んでいる）
  const byUser = new Map<string, { round: UnreviewedRound; m: UnreviewedMember }[]>();
  for (const x of picked) {
    if (!x.m.canNudge) { if (x.m.deleted) skippedOther++; else skippedCooldown++; continue; }
    if (!byUser.has(x.m.userId)) byUser.set(x.m.userId, []);
    byUser.get(x.m.userId)!.push(x);
  }

  const prev = await readNudges(Array.from(byUser.values()).flat().map((x) => ({ roundId: x.round.roundId, userId: x.m.userId })));
  let notifiedUsers = 0;
  let lineSent = 0;
  for (const [uid, items] of byUser) {
    const rep = items[0].round;   // 一覧が新しい順なので先頭が最新
    // 先に印を付ける（ボタンの二度押し・並行実行で二重に送らない）
    for (const it of items) {
      await stampNudge(it.round.roundId, uid, now, opts.scope, prev.get(nudgeId(it.round.roundId, uid))).catch(() => {});
    }
    try {
      const r = await sendReviewReminder(uid, { id: rep.roundId, title: rep.title, courseName: rep.courseName }, `review-nudge-${rep.roundId}-${uid}`);
      notifiedUsers++;
      if (r.line) lineSent++;
    } catch (e) {
      console.warn('[reviewNudge] send failed', { uid, err: (e as Error).message });
    }
  }

  return {
    ok: true, scope: opts.scope,
    targets: picked.length, notifiedUsers, lineSent, skippedCooldown, skippedOther,
  };
}
