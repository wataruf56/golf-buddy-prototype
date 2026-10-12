import 'server-only';
import { getAdminDb } from './firebase';
import { viewCohort, getCohort } from './ageGate';
import type { User } from './types';
import { hostSeat } from './hostCount';
import { isMarketingPopupEligible } from './popupEligibility';

// 募集中の1件を「イチオシ」としてポップアップで1回だけすすめる（2026-10-12）。
// 運営が登録（/api/admin/promo-popup）→ showAt を過ぎたら、アプリを開いた人に1回だけ出す（users.promoSeen[promoId]）。
// 出さない人：主催者・共同主催・参加者・申請中・招待中／別の年代（募集の hostCohort と違う）／停止中。
// 募集が募集中（open）でなくなった・開催日を過ぎた・until を過ぎたら、もう出さない。
// ほかのポップアップとの兼ね合い（何か出ていれば閉じて1時間後）は画面側（components/RoundPromoPopup）で判定する。
const COLL = '_promoPopups';

// texts … ポップアップの文言（components/RoundPromoCard の PromoTexts。空なら既定）
export type PromoDoc = { id: string; roundId: string; showAt: number; until: number; approved: boolean; headline?: string; texts?: Record<string, string>; createdAt: number };

export async function listPromos(): Promise<PromoDoc[]> {
  const adb = getAdminDb() as any;
  if (!adb) return [];
  try {
    const snap = await adb.collection(COLL).limit(50).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }) as PromoDoc);
  } catch { return []; }
}

export async function upsertPromo(id: string, data: Partial<PromoDoc>): Promise<PromoDoc | null> {
  const adb = getAdminDb() as any;
  if (!adb || !id) return null;
  const ref = adb.collection(COLL).doc(id);
  const cur = (await ref.get()).data() || {};
  const next = { ...cur, ...data, id, createdAt: cur.createdAt || Date.now() };
  await ref.set(next);
  return next as PromoDoc;
}

export async function deletePromo(id: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (adb && id) await adb.collection(COLL).doc(id).delete();
}

export async function activePromoFor(me: User): Promise<Record<string, unknown> | null> {
  if ((me as any).banned) return null;
  const now = Date.now();
  // プロフィール登録から24時間たっていない人には出さない（見た印も付けない＝あとで出る）（lib/popupEligibility）
  if (!isMarketingPopupEligible(me, now)) return null;
  const seen = ((me as any).promoSeen || {}) as Record<string, number>;
  const promos = (await listPromos()).filter((p) => p.approved && p.showAt && now >= p.showAt && (!p.until || now < p.until) && !seen[p.id]);
  if (!promos.length) return null;
  const { db } = await import('./db');
  const today = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
  for (const p of promos) {
    const r: any = await db.getRound(p.roundId);
    if (!r || r.status !== 'open' || (r.date && r.date < today)) continue;
    // テスト垢が主催する募集のイチオシは、テスト垢にしか出さない（本物の会員にテストの募集を出さない）
    const isTest = (id: string) => !!id && id.startsWith('test_');
    if (isTest(r.hostId) && !isTest(me.id)) continue;
    const involved = [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || []), ...(r.pendingApplicantIds || []), ...(r.invitedIds || [])];
    if (involved.includes(me.id)) continue;
    const myCohort = viewCohort(me.age);
    const roundCohort = r.hostCohort || getCohort((await db.getUser(r.hostId))?.age || 0);
    if (roundCohort && myCohort !== roundCohort) continue;
    const host = await db.getUser(r.hostId);
    // 公式募集は主催者を数えない（2026-10-12）
    const joined = hostSeat(r) + (r.applicantIds || []).length + Number(r.externalMale || 0) + Number(r.externalFemale || 0) + Number(r.externalCount || 0);
    return {
      promoId: p.id, roundId: r.id, headline: p.headline || '',
      texts: { ...(p.texts || {}), ...(p.headline && !(p.texts || {}).headline ? { headline: p.headline } : {}) },
      title: r.title || r.courseName || 'ラウンド', date: r.date || '', startTime: r.startTime || '',
      area: r.area || '', courseName: r.courseName || '', price: r.price || '', levelCondition: r.levelCondition || '',
      maxSpots: Number(r.maxSpots || 0), joined,
      host: host ? { id: host.id, displayName: host.displayName, avatar: host.avatar, avatarUrl: (host as any).avatarUrl || '', avatarMode: (host as any).avatarMode || '', color: (host as any).color || '', golmotiType: (host as any).golmotiType || '', age: host.age, gender: host.gender } : null,
    };
  }
  return null;
}

export async function markPromoSeen(userId: string, promoId: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !userId || !promoId) return;
  await adb.collection('users').doc(userId).set({ promoSeen: { [promoId]: Date.now() } }, { merge: true });
}

/** 押した（「ぜひ参加してみませんか？」）を記録。管理画面の集計用 */
export async function markPromoGo(userId: string, promoId: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !userId || !promoId) return;
  await adb.collection('users').doc(userId).set({ promoGo: { [promoId]: Date.now() } }, { merge: true });
}

/** 管理画面の集計：表示した人数・押した人数・その後に申請／参加した人数 */
export async function promoStats(p: PromoDoc): Promise<{ seen: number; go: number; joined: number }> {
  const adb = getAdminDb() as any;
  if (!adb) return { seen: 0, go: 0, joined: 0 };
  const count = async (field: string) => {
    try { const a = await adb.collection('users').where(`${field}.${p.id}`, '>', 0).count().get(); return Number(a.data()?.count || 0); } catch { return 0; }
  };
  const [seen, go] = await Promise.all([count('promoSeen'), count('promoGo')]);
  let joined = 0;
  try {
    const snap = await adb.collection('users').where(`promoSeen.${p.id}`, '>', 0).limit(2000).get();
    const ids = new Set<string>(snap.docs.map((d: any) => d.id));
    const r = (await adb.collection('rounds').doc(p.roundId).get()).data() || {};
    for (const id of [...(r.applicantIds || []), ...(r.pendingApplicantIds || [])]) if (ids.has(id)) joined += 1;
  } catch { /* noop */ }
  return { seen, go, joined };
}
