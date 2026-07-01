import { NextRequest, NextResponse } from 'next/server';
import { listRestrictions, setRestriction, type UserRestriction } from '@/lib/banAccess';

// 管理者用：ユーザーごとの「部分制限」を取得/設定する。
//   GET  ?token=XXX                     → { map: { [uid]: {noCreate,noInvite,applyBlockHostIds} } }
//   POST ?token=XXX  { userId, noCreate?, noInvite?, applyBlockHostIds? } → 上書き保存
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

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
    noInvite: !!body?.noInvite,
    applyBlockHostIds: Array.isArray(body?.applyBlockHostIds) ? body.applyBlockHostIds.map((s: any) => String(s)) : [],
  };
  try {
    const saved = await setRestriction(userId, patch);
    return NextResponse.json({ ok: true, userId, restriction: saved }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
