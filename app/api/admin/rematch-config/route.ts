import { NextRequest, NextResponse } from 'next/server';
import { getRematchConfig, setRematchConfig } from '@/lib/rematchConfig';
import { getAdminDb } from '@/lib/firebase';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理者用：再会エンジンの設定取得/更新＋5段ファネル集計。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

async function funnelCounts(): Promise<Record<string, number>> {
  const db = getAdminDb() as any;
  const base = { rematch_notify_open: 0, rematch_input_one: 0, rematch_input_both: 0, rematch_agreed: 0, rematch_to_round_post: 0 };
  if (!db) return base;
  try {
    const snap = await db.collection('_rematchEvents').limit(5000).get();
    snap.docs.forEach((d: any) => { const e = d.data()?.event; if (e in base) (base as any)[e]++; });
  } catch { /* noop */ }
  return base;
}

// いま動いている再会セッションの明細。
// これまで件数のファネルしか見られず「誰と誰に、何回送ったのか」が分からなかった。
async function sessions(): Promise<any[]> {
  const db = getAdminDb() as any;
  if (!db) return [];
  try {
    const snap = await db.collection('_rematch').limit(300).get();
    const rows = snap.docs.map((d: any) => d.data()).filter(Boolean);
    const ids = Array.from(new Set(rows.flatMap((r: any) => [r.userA, r.userB]).filter(Boolean)));
    const names: Record<string, string> = {};
    try {
      const { db: store } = await import('@/lib/db');
      (await store.listUsers(ids as string[])).forEach((u: any) => { if (u) names[u.id] = u.displayName || ''; });
    } catch { /* 名前が出なくても明細は返す */ }
    return rows
      .map((r: any) => ({
        pairId: r.pairId, userA: r.userA, userB: r.userB,
        nameA: names[r.userA] || r.userA, nameB: names[r.userB] || r.userB,
        status: r.status, matchKind: r.matchKind,
        notifyCount: r.notifyCount || 0,
        firstNotifyAt: r.firstNotifyAt || 0, lastNotifyAt: r.lastNotifyAt || 0,
        courseName: r.courseName || '', roundDate: r.roundDate || '',
        agreedDate: r.agreedDate || null, postedRoundId: r.postedRoundId || null,
        candidatesA: (r.candidatesA || []).length, candidatesB: (r.candidatesB || []).length,
        optedOutBy: r.optedOutBy || [],
      }))
      .sort((a: any, b: any) => (b.lastNotifyAt || 0) - (a.lastNotifyAt || 0));
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const [config, funnel, list] = await Promise.all([getRematchConfig(), funnelCounts(), sessions()]);
  return NextResponse.json({ config, funnel, sessions: list }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  try {
    const config = await setRematchConfig({
      intervalDays: body?.intervalDays,
      maxCycles: body?.maxCycles,
      candidateWindowDays: body?.candidateWindowDays,
      enabled: body?.enabled,
      testMode: body?.testMode,
    });
    await audit({
      ...(await adminActor(null)),
      action: AUDIT_ACTION.configSave, targetKind: 'config', targetId: 'rematch',
      summary: '再会エンジンの設定を変更した',
      detail: config as any,
    }, req);
    return NextResponse.json({ ok: true, config }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
