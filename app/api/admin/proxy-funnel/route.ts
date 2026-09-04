import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { listActiveThreads, listThreads, officialOf, takenSeats, totalSeats } from '@/lib/officialThread';
import { isTestId, warmTestIds } from '@/lib/testAccounts';

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
  // 手動登録したテストアカウントも外すため、最初に1回だけ読み込む。
  await warmTestIds();
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const u = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get('days') || 30)));
  const since = Date.now() - days * 86400000;

  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  // 人単位で数えるため、イベントごとに userId の集合を作る。
  const uniq: Record<string, Set<string>> = {};
  // 「誰が」を出すために、人ごとに最初に見た時刻も持つ。
  // 人数だけだと「続けるか直すか」の判断ができない。誰が動いて誰が止まったかが要る。
  const firstSeen: Record<string, Record<string, number>> = {};
  try {
    const snap = await db.collection('_logs').orderBy('ts', 'desc').limit(8000).get();
    for (const d of snap.docs) {
      const r = d.data() || {};
      if ((r.ts || 0) < since) continue;
      const ev = String(r.event || '');
      if (!ev.startsWith('pr_')) continue;
      const uid = String(r.userId || '');
      if (!uid || isTestId(uid)) continue;   // 動作確認ぶんは混ぜない
      (uniq[ev] ||= new Set()).add(uid);
      const m = (firstSeen[ev] ||= {});
      // 新しい順に読んでいるので、後から来たものほど古い＝最初に見た時刻になる
      m[uid] = r.ts || 0;
    }
  } catch (e) {
    console.error('[proxy-funnel] read failed', (e as Error).message);
  }
  const n = (k: string) => uniq[k]?.size || 0;

  // 「あとで抜けた」は操作ログ（入退室）から数える。声かけの計測には出てこないため。
  let leftAfter = 0;
  const leavers: any[] = [];
  const joiners: any[] = [];
  try {
    const { listAudit, AUDIT_ACTION } = await import('@/lib/auditLog');
    const [leaveRows, joinRows] = await Promise.all([
      listAudit({ limit: 500, action: AUDIT_ACTION.groupLeave, since }),
      listAudit({ limit: 500, action: AUDIT_ACTION.groupJoin, since }),
    ]);
    const real = (r: any) => (r.detail as any)?.official && !isTestId(r.actorId);
    leftAfter = new Set(leaveRows.filter(real).map((r) => `${r.actorId}:${r.targetId}`)).size;

    // 入った時刻と突き合わせて「どれくらい居たか」を出す。
    // すぐ抜けているなら中身の問題、長く居て抜けたなら成立しなかった問題。
    const joinAt: Record<string, number> = {};
    joinRows.filter(real).forEach((r) => {
      const k = `${r.actorId}:${r.targetId}`;
      if (!joinAt[k] || r.ts < joinAt[k]) joinAt[k] = r.ts;
      joiners.push({
        userId: r.actorId, name: r.actorName || '', ts: r.ts,
        roundId: r.targetId, roundTitle: r.targetName || '',
        by: (r.detail as any)?.by || '', role: (r.detail as any)?.role || '',
      });
    });
    leaveRows.filter(real).forEach((r) => {
      const k = `${r.actorId}:${r.targetId}`;
      const jt = joinAt[k];
      leavers.push({
        userId: r.actorId, name: r.actorName || '', ts: r.ts,
        roundId: r.targetId, roundTitle: r.targetName || '',
        by: (r.detail as any)?.by || '',
        stayedMs: jt ? r.ts - jt : undefined,
      });
    });
    joiners.sort((a, b) => b.ts - a.ts);
    leavers.sort((a, b) => b.ts - a.ts);
  } catch { /* 出せなくても他は返す */ }

  // いま動いている代理募集の枠。数字だけだと何が起きているか分からないので添える。
  let threads: any[] = [];
  let doneCount = 0;
  try {
    const [actives, all] = await Promise.all([listActiveThreads(), listThreads()]);
    const isProxy = (r: any) => {
      const o = officialOf(r); return !!(o?.driverId || (o?.stations && o.stations.length));
    };
    const proxyActives = actives.filter(isProxy);

    // いま入室中の人を、名前を付けて出す。
    // 「何人」だけでは、続けるか直すかの判断ができない。
    // 同じ人ばかりが回っているのか、新しい人が入っているのかで打ち手が変わる。
    const memberIds = Array.from(new Set(proxyActives.flatMap((r) => r.applicantIds || [])
      .filter((id) => !isTestId(id))));
    const people: Record<string, any> = {};
    try {
      const { db: appDb } = await import('@/lib/db');
      (await appDb.listUsers(memberIds)).forEach((u: any) => { if (u) people[u.id] = u; });
    } catch { /* 名前が無くても件数は出す */ }

    threads = proxyActives.map((r) => {
      const o = officialOf(r)!;
      return {
        id: r.id, title: r.title, stations: o.stations || [],
        driverId: o.driverId || '', driverWanted: !!o.driverWanted,
        stage: o.stage, taken: takenSeats(r), total: totalSeats(r),
        createdAt: r.createdAt || 0,
        members: (r.applicantIds || []).filter((id: string) => !isTestId(id)).map((id: string) => {
          const u = people[id] || {};
          return {
            id, name: u.displayName || '(名前なし)',
            gender: u.gender || '', age: u.age || 0, area: u.area || '', car: u.car || '',
            isDriver: o.driverId === id,
          };
        }),
      };
    });
    doneCount = all.filter(isProxy).length;
  } catch { /* noop */ }

  // 判断に使う率。分母が小さいときは率を出さない（3人中1人で33%と書くと読み違える）。
  const rate = (a: number, b: number) => (b >= 5 ? Math.round((a / b) * 100) : null);
  const viewers = n('pr_rider_view') + n('pr_driver_view');
  const joined = n('pr_rider_join') + n('pr_driver_done');
  const inNow = threads.reduce((acc, t: any) => acc + (t.members?.length || 0), 0);

  // 見た人の一覧（誰が見て、そのあと入ったか）。
  const joinedIds = new Set(joiners.map((j: any) => j.userId));
  const viewerList = Object.entries({ ...(firstSeen['pr_rider_view'] || {}), ...(firstSeen['pr_driver_view'] || {}) })
    .map(([userId, ts]) => ({
      userId, ts,
      name: (joiners.find((j: any) => j.userId === userId)?.name)
        || (leavers.find((l: any) => l.userId === userId)?.name) || '',
      joined: joinedIds.has(userId),
    }))
    .sort((a, b) => b.ts - a.ts);

  return NextResponse.json({
    days,
    driver: DRIVER_STEPS.map((s) => ({ ...s, n: n(s.key) })),
    rider: [...RIDER_STEPS.map((s) => ({ ...s, n: n(s.key) })),
            { key: 'left_after', label: 'あとで抜けた', n: leftAfter, bad: true }],
    threads, doneCount,
    // 判断のための集計
    summary: {
      viewers, joined, inNow, left: leftAfter,
      joinRate: rate(joined, viewers),        // 見た人のうち入った割合
      stayRate: rate(inNow, joined),          // 入った人のうち残っている割合
      people: new Set([...joiners, ...leavers].map((x: any) => x.userId)).size,
    },
    viewerList, joiners, leavers,
  }, { headers: noStore });
}
