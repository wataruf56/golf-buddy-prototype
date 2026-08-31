import { NextRequest, NextResponse } from 'next/server';
import { listAudit, AUDIT_ACTION, type AuditEntry } from '@/lib/auditLog';
import { isTestId, warmTestIds } from '@/lib/testAccounts';

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
  const groups = new Map<string, { groupId: string; title: string; official: boolean; events: Ev[] }>();
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

  const out = Array.from(groups.values()).map((g) => {
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
    stays.sort((a, b) => (b.joinedAt || b.leftAt || 0) - (a.joinedAt || a.leftAt || 0));

    return {
      ...g,
      events: g.events.slice().reverse(),         // 画面は新しい順
      stays,
      lastTs: g.events.length ? g.events[g.events.length - 1].ts : 0,
      inNow: stays.filter((s) => s.inNow).length,
      leftCount: stays.filter((s) => !s.inNow).length,
    };
  });
  out.sort((a, b) => b.lastTs - a.lastTs);

  return NextResponse.json({
    groups: out, days,
    totalJoin: rows.filter((r) => r.action === AUDIT_ACTION.groupJoin).length,
    totalLeave: rows.filter((r) => r.action === AUDIT_ACTION.groupLeave).length,
  }, { headers: noStore });
}
