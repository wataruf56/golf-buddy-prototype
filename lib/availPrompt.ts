import 'server-only';
import { getAdminDb } from './firebase';
import { viewCohort } from './ageGate';
import type { Round, User } from './types';

// ラウンド（コンペ）の参加者に「行ける日」の入力をすすめる、1回だけのポップアップ＋LINE（2026-10-11）
//
// 【流れ】
//   1. 運営が対象のラウンドを登録する（/api/admin/avail-prompt）。登録しただけでは出ない
//   2. 運営が OK（approved:true）を出し、出す時刻（showAt）になったら
//      ・アプリを開いた参加者にポップアップ（下の条件をすべて満たす人だけ）
//      ・参加者に LINE ＋アプリ内のお知らせを1回だけ（housekeeping の cron が送る）
//   3. 「入力する」でも「閉じる」でも、その人にはもう出さない（users.availPromptSeen[roundId]）
//
// 【ポップアップを出す条件】
//   ・そのラウンドが完了（completed）していて、その人が参加者（主催者・共同主催・承認済み）
//   ・20〜30代（行ける日の対象）
//   ・まだ「行ける日」を1日も入れていない
//   ・自分のレビューが残っていない（レビューが先。レビュー画面は閉じられない）
//   ・まだこのポップアップを見ていない
//   ・showAt から7日以内
//
// 保存先：_availPrompts/{roundId} = { roundId, title, date, showAt, approved, lineSentAt?, lineSent?, createdAt }
const COLL = '_availPrompts';
const ACTIVE_MS = 7 * 86400000;

export type AvailPromptDoc = {
  roundId: string; title: string; date: string; showAt: number; approved: boolean;
  lineSentAt?: number; lineSent?: number; createdAt: number;
};

export function participantsOf(r: Pick<Round, 'hostId' | 'coHostIds' | 'applicantIds'>): string[] {
  return Array.from(new Set([r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean)));
}

export async function listAvailPrompts(): Promise<AvailPromptDoc[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const snap = await adb.collection(COLL).limit(100).get();
    return snap.docs.map((d: any) => ({ roundId: d.id, ...(d.data() || {}) }) as AvailPromptDoc).sort((a: AvailPromptDoc, b: AvailPromptDoc) => b.createdAt - a.createdAt);
  } catch { return []; }
}

export async function upsertAvailPrompt(roundId: string, patch: Partial<AvailPromptDoc>): Promise<AvailPromptDoc | null> {
  const adb = getAdminDb() as any;
  if (!adb || !roundId) return null;
  const { db } = await import('./db');
  const round = await db.getRound(roundId);
  if (!round) return null;
  const ref = adb.collection(COLL).doc(roundId);
  const cur = (await ref.get()).data() || {};
  const next: AvailPromptDoc = {
    roundId, title: round.title || round.courseName || 'ラウンド', date: round.date || '',
    showAt: Number(patch.showAt ?? cur.showAt) || 0, approved: !!(patch.approved ?? cur.approved),
    ...(cur.lineSentAt ? { lineSentAt: cur.lineSentAt, lineSent: cur.lineSent || 0 } : {}),
    createdAt: cur.createdAt || Date.now(),
  };
  await ref.set(next);
  return next;
}

export async function deleteAvailPrompt(roundId: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (adb && roundId) await adb.collection(COLL).doc(roundId).delete();
}

async function hasAvailability(userId: string): Promise<boolean> {
  const { getAvailability } = await import('./availability');
  return !!(await getAvailability(userId))?.dates?.length;
}

/** いまこの人に出すポップアップ（無ければ null） */
export async function activeAvailPromptFor(me: User): Promise<{ roundId: string; title: string; date: string } | null> {
  if (viewCohort(me.age) !== 'a') return null;
  const now = Date.now();
  const seen = ((me as any).availPromptSeen || {}) as Record<string, number>;
  const prompts = (await listAvailPrompts()).filter((p) => p.approved && p.showAt && now >= p.showAt && now < p.showAt + ACTIVE_MS && !seen[p.roundId]);
  if (!prompts.length) return null;
  const { db } = await import('./db');
  for (const p of prompts) {
    const round = await db.getRound(p.roundId);
    if (!round || round.status !== 'completed' || !participantsOf(round).includes(me.id)) continue;
    if ((await db.listPendingReviews(me.id)).length) return null;   // レビューが先
    if (await hasAvailability(me.id)) return null;
    return { roundId: p.roundId, title: p.title, date: p.date };
  }
  return null;
}

export async function markAvailPromptSeen(userId: string, roundId: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !userId || !roundId) return;
  await adb.collection('users').doc(userId).set({ availPromptSeen: { [roundId]: Date.now() } }, { merge: true });
}

function mdLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  return m ? `${Number(m[2])}月${Number(m[3])}日` : '';
}

/** cron：OK が出て時刻を過ぎたものは、参加者（行ける日が未入力の20〜30代）に LINE＋お知らせを1回だけ送る */
export async function sendDueAvailPromptLines(): Promise<{ sent: number; prompts: number }> {
  const adb = getAdminDb() as any;
  if (!adb) return { sent: 0, prompts: 0 };
  const now = Date.now();
  const due = (await listAvailPrompts()).filter((p) => p.approved && p.showAt && now >= p.showAt && now < p.showAt + ACTIVE_MS && !p.lineSentAt);
  let sent = 0;
  const { db } = await import('./db');
  for (const p of due) {
    const round = await db.getRound(p.roundId);
    // 先に印を付ける（cron が重なっても二重に送らない）
    await adb.collection(COLL).doc(p.roundId).set({ lineSentAt: now }, { merge: true });
    if (!round || round.status !== 'completed') continue;
    const users = (await db.listUsers(participantsOf(round))).filter(Boolean) as User[];
    const targets: string[] = [];
    for (const u of users) {
      if (viewCohort(u.age) !== 'a' || (u as any).banned) continue;
      if (((u as any).availPromptSeen || {})[p.roundId]) continue;
      if (await hasAvailability(u.id)) continue;
      targets.push(u.id);
    }
    const when = mdLabel(p.date);
    const text = `⛳ ${when ? `${when}の` : ''}「${p.title}」でご一緒したみんなと、また一緒に行きませんか？\nあなたが行ける日を入力しておくと、同じ日に行ける人と次のラウンドを組みやすくなります。`;
    const link = '/availability';
    const { addNotificationMany } = await import('./notifications');
    await addNotificationMany(targets, 'roundUpcoming', text.split('\n')[0], link).catch(() => {});
    const { pushTo, liffUrl } = await import('./linePush');
    for (const uid of targets) {
      await pushTo(uid, text, liffUrl(link), 'availPrompt').catch(() => {});
      sent += 1;
    }
    await adb.collection(COLL).doc(p.roundId).set({ lineSent: targets.length }, { merge: true });
  }
  return { sent, prompts: due.length };
}

/** 運営向け：レビューの進み具合と、対象になりそうな人数 */
export async function availPromptProgress(roundId: string): Promise<Record<string, unknown> | null> {
  const { db } = await import('./db');
  const round = await db.getRound(roundId);
  if (!round) return null;
  const ids = participantsOf(round);
  const users = (await db.listUsers(ids)).filter(Boolean) as User[];
  const pendingReviewers = await db.listPendingReviewersForRound(roundId);
  let noAvail = 0; let seen = 0; let cohortA = 0;
  for (const u of users) {
    if (viewCohort(u.age) !== 'a') continue;
    cohortA += 1;
    if (((u as any).availPromptSeen || {})[roundId]) seen += 1;
    if (!(await hasAvailability(u.id))) noAvail += 1;
  }
  return {
    status: round.status, participants: ids.length, cohortA,
    reviewsPending: pendingReviewers.length,
    reviewsPendingNames: users.filter((u) => pendingReviewers.includes(u.id)).map((u) => u.displayName),
    noAvailability: noAvail, seenPopup: seen,
  };
}
