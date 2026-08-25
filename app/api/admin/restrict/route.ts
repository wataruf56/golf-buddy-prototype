import { NextRequest, NextResponse } from 'next/server';
import { listRestrictions, setRestriction, type UserRestriction } from '@/lib/banAccess';
import { audit, adminActor, AUDIT_ACTION } from '@/lib/auditLog';

// 管理者用：ユーザーごとの「部分制限」を取得/設定する。
//   GET  ?token=XXX                     → { map: { [uid]: {noCreate,noInvite,applyBlockHostIds} } }
//   POST ?token=XXX  { userId, noCreate?, noInvite?, applyBlockHostIds? } → 上書き保存
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const R_LABEL: Record<string, string> = {
  noCreate: '募集の作成', noApplyAll: '参加申込', noInvite: '招待', noChat: 'チャット',
  noDM: 'DM', noInterest: '気になる', noReview: 'レビュー',
};

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const map = await listRestrictions();
  return NextResponse.json({ map }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const userId = String(body?.userId || '').trim();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });
  const patch: UserRestriction = {
    noCreate: !!body?.noCreate,
    noApplyAll: !!body?.noApplyAll,
    noInvite: !!body?.noInvite,
    noChat: !!body?.noChat,
    noDM: !!body?.noDM,
    noInterest: !!body?.noInterest,
    noReview: !!body?.noReview,
    applyBlockHostIds: Array.isArray(body?.applyBlockHostIds) ? body.applyBlockHostIds.map((s: any) => String(s)) : [],
  };
  try {
    const saved = await setRestriction(userId, patch);
    const { db } = await import('@/lib/db');
    const name = (await db.getUser(userId))?.displayName || '';
    const on = Object.entries(patch)
      .filter(([k, v]) => v === true).map(([k]) => R_LABEL[k] || k);
    await audit({
      ...(await adminActor(null)),
      action: AUDIT_ACTION.userRestrict,
      targetKind: 'user', targetId: userId, targetName: name,
      summary: on.length
        ? `会員「${name || userId}」の ${on.join('・')} を止めた`
        : `会員「${name || userId}」の制限をすべて解除した`,
      detail: { restriction: saved },
    }, req);
    return NextResponse.json({ ok: true, userId, restriction: saved }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
