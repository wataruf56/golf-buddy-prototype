import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { listActiveThreads, listThreads, officialOf, takenSeats, totalSeats } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

// 管理者の代理ラウンド募集の計測。
//
// **2本のファネルに分ける。**見ている人が別なので、1本にすると読めない。
//   ・車を出せる人（プロフィール「車あり」の人だけが対象）
//   ・誘われた人（駅の周辺にいる人）
//
// 数えるのは**人数**であって回数ではない。同じ人が何度もホームを開けば
// イベントは増えるが、それを足すと「見た人」が実際より多く見える。
// userId で重複を落としてから数える。

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const DRIVER_STEPS = [
  { key: 'pr_driver_view',  label: '声かけを見た' },
  { key: 'pr_driver_open',  label: '「駅を選ぶ」を押した' },
  { key: 'pr_driver_done',  label: '駅を登録した（枠が立った）' },
  { key: 'pr_driver_later', label: '「あとで」を押した', muted: true },
];

const RIDER_STEPS = [
  { key: 'pr_rider_view',  label: '声かけを見た' },
  { key: 'pr_rider_join',  label: '「予定が合えば行きたい」' },
  { key: 'pr_rider_later', label: '「あとで」を押した', muted: true },
];

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const u = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get('days') || 30)));
  const since = Date.now() - days * 86400000;

  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  // 人単位で数えるため、イベントごとに userId の集合を作る。
  const uniq: Record<string, Set<string>> = {};
  try {
    const snap = await db.collection('_logs').orderBy('ts', 'desc').limit(8000).get();
    for (const d of snap.docs) {
      const r = d.data() || {};
      if ((r.ts || 0) < since) continue;
      const ev = String(r.event || '');
      if (!ev.startsWith('pr_')) continue;
      const uid = String(r.userId || '');
      if (!uid || uid.startsWith('test_')) continue;   // 動作確認ぶんは混ぜない
      (uniq[ev] ||= new Set()).add(uid);
    }
  } catch (e) {
    console.error('[proxy-funnel] read failed', (e as Error).message);
  }
  const n = (k: string) => uniq[k]?.size || 0;

  // 「あとで抜けた」は操作ログ（入退室）から数える。声かけの計測には出てこないため。
  let leftAfter = 0;
  try {
    const { listAudit, AUDIT_ACTION } = await import('@/lib/auditLog');
    const rows = await listAudit({ limit: 500, action: AUDIT_ACTION.groupLeave, since });
    leftAfter = new Set(rows
      .filter((r) => (r.detail as any)?.official && !String(r.actorId).startsWith('test_'))
      .map((r) => `${r.actorId}:${r.targetId}`)).size;
  } catch { /* 出せなくても他は返す */ }

  // いま動いている代理募集の枠。数字だけだと何が起きているか分からないので添える。
  let threads: any[] = [];
  let doneCount = 0;
  try {
    const [actives, all] = await Promise.all([listActiveThreads(), listThreads()]);
    const isProxy = (r: any) => {
      const o = officialOf(r); return !!(o?.driverId || (o?.stations && o.stations.length));
    };
    threads = actives.filter(isProxy).map((r) => {
      const o = officialOf(r)!;
      return {
        id: r.id, title: r.title, stations: o.stations || [],
        driverId: o.driverId || '', driverWanted: !!o.driverWanted,
        stage: o.stage, taken: takenSeats(r), total: totalSeats(r),
      };
    });
    doneCount = all.filter(isProxy).length;
  } catch { /* noop */ }

  return NextResponse.json({
    days,
    driver: DRIVER_STEPS.map((s) => ({ ...s, n: n(s.key) })),
    rider: [...RIDER_STEPS.map((s) => ({ ...s, n: n(s.key) })),
            { key: 'left_after', label: 'あとで抜けた', n: leftAfter, bad: true }],
    threads, doneCount,
  }, { headers: noStore });
}
