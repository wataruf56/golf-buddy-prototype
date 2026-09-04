import { NextRequest, NextResponse } from 'next/server';
import { listAudit, AUDIT_ACTION, type AuditEntry } from '@/lib/auditLog';
import { isTestId, warmTestIds } from '@/lib/testAccounts';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

// グループの入退室ログ。**誰がいつ入って、いつ抜けたか**をグループごとに並べる。
//
// 元データは操作ログ（_auditLog）の group.join / group.leave そのもの。
// 台帳を別に持たないのは、同じ出来事を2か所に書くと必ずズレるため。
// ここでやるのは「並べ替えと突き合わせ」だけ。
//
//   ?days=       … 期間（既定30日）
//   ?userId=     … この人の出入りだけ
//   ?includeTest=1 … テストアカウント（test_）も混ぜる（既定は除く）

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

type Ev = { ts: number; kind: 'join' | 'leave'; userId: string; userName?: string; by?: string };
type Stay = {
  userId: string; userName?: string;
  joinedAt?: number;          // 入った時刻（記録を入れる前から居た人は空）
  leftAt?: number;            // 抜けた時刻（まだ居る人は空）
  stayedMs?: number;          // 両方そろったときだけ
  joinBy?: string; leaveBy?: string;   // 'self' か 'host'（承認・強制退出）
  inNow: boolean;
  // 「誰が」を名前だけで見せると、同姓や似た名前で取り違える。
  // プロフィールを添えて、どの人か判断できるようにする。
  gender?: string; age?: number; area?: string; car?: string;
  /** この枠で車を出す人か */
  isDriver?: boolean;
  /** 何度目の出入りか（入り直した人は2回目・3回目と出る） */
  visit?: number;
};

export async function GET(req: NextRequest) {
  // 手動登録したテストアカウントも外すため、最初に1回だけ読み込む。
  await warmTestIds();
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const u = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(u.searchParams.get('days') || 30)));
  const userId = u.searchParams.get('userId') || '';
  const includeTest = u.searchParams.get('includeTest') === '1';

  const all = await listAudit({ limit: 500, since: Date.now() - days * 86400000 });
  let rows = all.filter((r) => r.action === AUDIT_ACTION.groupJoin || r.action === AUDIT_ACTION.groupLeave);
  if (userId) rows = rows.filter((r) => r.actorId === userId);
  // テストアカウントの出入りは既定で外す。動作確認の行が混ざると、
  // 実際の会員がどう動いたのかが読めなくなるため。
  if (!includeTest) rows = rows.filter((r) => !isTestId(r.actorId));

  // グループ（＝ラウンド）ごとにまとめる
  const groups = new Map<string, {
    groupId: string; title: string; official: boolean; events: Ev[];
  }>();
  for (const r of rows) {
    const gid = r.targetId || '(不明)';
    if (!groups.has(gid)) {
      groups.set(gid, {
        groupId: gid,
        title: r.targetName || '(名前なし)',
        official: !!(r.detail as any)?.official,
        events: [],
      });
    }
    const g = groups.get(gid)!;
    if ((r.detail as any)?.official) g.official = true;
    g.events.push({
      ts: r.ts,
      kind: r.action === AUDIT_ACTION.groupJoin ? 'join' : 'leave',
      userId: r.actorId,
      userName: r.actorName,
      by: (r.detail as any)?.by,
    });
  }

  // 名前だけでは「誰が入っているのか」が分からないので、プロフィールを引く。
  // 出入りに出てくる人だけを1回でまとめて読む（1人ずつ読むと本数分だけ往復する）。
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter(Boolean)));
  const people: Record<string, any> = {};
  try {
    const { db: appDb } = await import('@/lib/db');
    (await appDb.listUsers(actorIds)).forEach((u: any) => { if (u) people[u.id] = u; });
  } catch { /* 名前だけでも出す */ }

  // 枠のほうも読む。代理ラウンド募集なら、駅・車を出す人・いまの人数が分かる。
  // これが無いと「どの枠の出入りか」が題名の文字列だけになってしまう。
  const roundInfo: Record<string, any> = {};
  try {
    const adb = getAdminDb() as any;
    const gids = adb ? Array.from(groups.keys()) : [];
    await Promise.all(gids.map(async (gid) => {
      try {
        const snap = await adb.collection('rounds').doc(gid).get();
        if (!snap.exists) return;
        const r = snap.data() || {};
        const o = r.official || null;
        roundInfo[gid] = {
          exists: true,
          status: r.status || '',
          members: (r.applicantIds || []).length,
          maxSpots: r.maxSpots || 0,
          proxy: !!(o && (o.driverId || (o.stations && o.stations.length))),
          stations: (o && o.stations) || [],
          driverId: (o && o.driverId) || '',
          driverWanted: !!(o && o.driverWanted),
          stage: (o && o.stage) || '',
        };
      } catch { /* 1件読めなくても他は出す */ }
    }));
  } catch { /* noop */ }

  const out = Array.from(groups.values()).map((g) => {
    const info = roundInfo[g.groupId] || null;
    g.events.sort((a, b) => a.ts - b.ts);   // 古い順に見ないと入⇄抜が組めない

    // 人ごとに 入った→抜けた を順に組む。
    // 入り直した人は行が増える（「いつ入っていつ抜けたか」を1行1回で見せたいため）。
    const open = new Map<string, Stay>();
    const stays: Stay[] = [];
    for (const e of g.events) {
      if (e.kind === 'join') {
        // 前の滞在が閉じないまま次のjoinが来たら、そこで打ち切って新しく始める
        if (open.has(e.userId)) { stays.push(open.get(e.userId)!); open.delete(e.userId); }
        open.set(e.userId, {
          userId: e.userId, userName: e.userName, joinedAt: e.ts, joinBy: e.by, inNow: true,
        });
      } else {
        const s = open.get(e.userId);
        if (s) {
          open.delete(e.userId);
          stays.push({ ...s, leftAt: e.ts, stayedMs: e.ts - (s.joinedAt || e.ts), leaveBy: e.by, inNow: false });
        } else {
          // 記録を入れる前から居た人。入った時刻は分からないので、正直に空で出す。
          stays.push({ userId: e.userId, userName: e.userName, leftAt: e.ts, leaveBy: e.by, inNow: false });
        }
      }
    }
    open.forEach((s) => stays.push(s));           // まだ居る人

    // 何度目の出入りかを数える。入り直した人は2回目・3回目と出す
    // （「一度抜けたのにまた入っている」が分からないと、人数の増減だけ見て混乱する）。
    const seen: Record<string, number> = {};
    stays.sort((a, b) => (a.joinedAt || a.leftAt || 0) - (b.joinedAt || b.leftAt || 0));
    stays.forEach((st) => {
      seen[st.userId] = (seen[st.userId] || 0) + 1;
      st.visit = seen[st.userId];
      const u = people[st.userId];
      if (u) {
        st.gender = u.gender; st.age = u.age; st.area = u.area; st.car = u.car;
      }
      st.isDriver = !!(info && info.driverId && info.driverId === st.userId);
    });
    stays.sort((a, b) => (b.joinedAt || b.leftAt || 0) - (a.joinedAt || a.leftAt || 0));

    // いま中にいる人だけを先に取り出す。ここが「誰が入っているか」の答えなので、
    // 抜けた人と混ぜて並べると探さないと分からない。
    const current = stays.filter((st) => st.inNow)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

    return {
      ...g,
      info,
      events: g.events.slice().reverse(),         // 画面は新しい順
      stays,
      current,
      lastTs: g.events.length ? g.events[g.events.length - 1].ts : 0,
      inNow: current.length,
      leftCount: stays.filter((st) => !st.inNow).length,
      // 出入りに出てきた「のべ人数」ではなく実人数
      peopleCount: new Set(stays.map((st) => st.userId)).size,
    };
  });
  out.sort((a, b) => b.lastTs - a.lastTs);

  return NextResponse.json({
    groups: out, days,
    totalJoin: rows.filter((r) => r.action === AUDIT_ACTION.groupJoin).length,
    totalLeave: rows.filter((r) => r.action === AUDIT_ACTION.groupLeave).length,
  }, { headers: noStore });
}
