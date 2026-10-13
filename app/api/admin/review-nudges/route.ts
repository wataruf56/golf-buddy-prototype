import { NextRequest, NextResponse } from 'next/server';
import { listUnreviewed, sendReviewNudges, NUDGE_COOLDOWN_MS, type NudgeScope } from '@/lib/reviewNudge';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理画面「⏰ 未レビュー」（/admin/unreviewed）用（2026-10-14）。
//   GET  ?token=&days=60  → 完了ラウンドごとの未レビュー者一覧
//   POST ?token=          body { scope: 'user'|'round'|'all', roundId?, userId?, days? } → レビューの催促を送る
// 実処理は lib/reviewNudge（route ファイルは HTTP ハンドラ以外を export しない）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

function clampDays(v: unknown): number {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3650) : 60;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const days = clampDays(new URL(req.url).searchParams.get('days'));
  try {
    const rounds = await listUnreviewed(days);
    const members = rounds.flatMap((r) => r.members);
    const totals = {
      rounds: rounds.length,
      pairs: members.length,
      reviewers: new Set(members.map((m) => m.userId)).size,
      sendablePairs: members.filter((m) => m.canNudge).length,
      sendableReviewers: new Set(members.filter((m) => m.canNudge).map((m) => m.userId)).size,
    };
    return NextResponse.json({ ok: true, days, cooldownHours: NUDGE_COOLDOWN_MS / 3600000, totals, rounds }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = await req.json(); } catch {}
  const scope = String(body?.scope || '') as NudgeScope;
  if (!['user', 'round', 'all'].includes(scope)) return NextResponse.json({ error: 'scope must be user|round|all' }, { status: 400, headers: noStore });
  const roundId = String(body?.roundId || '');
  const userId = String(body?.userId || '');
  if (scope !== 'all' && !roundId) return NextResponse.json({ error: 'roundId required' }, { status: 400, headers: noStore });
  if (scope === 'user' && !userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });
  try {
    const res = await sendReviewNudges({ scope, roundId, userId, days: clampDays(body?.days) });
    await audit({
      ...(await adminActor(null)),
      action: AUDIT_ACTION.reviewNudge,
      targetKind: scope === 'user' ? 'user' : scope === 'round' ? 'round' : 'broadcast',
      targetId: scope === 'user' ? userId : scope === 'round' ? roundId : undefined,
      summary: scope === 'user' ? 'レビューの催促を1人に送った'
        : scope === 'round' ? 'この募集の未レビュー全員にレビューの催促を送った'
        : '全部の未レビューにレビューの催促を一斉送信した',
      detail: { ...res, roundId: roundId || undefined, userId: userId || undefined } as any,
    }, req);
    return NextResponse.json(res, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
