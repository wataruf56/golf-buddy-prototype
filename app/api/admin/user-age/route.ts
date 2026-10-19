import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/admin/user-age?token= { userId, age?: number, cohortOverride?: 'a' | null } … 管理画面から（2026-10-20 本人指定）
//   age            … 年齢を変える（本人は一度登録すると変えられない・/api/me）。0〜99
//   cohortOverride … 'a' ＝40歳以上でも特例で20〜30代のコミュニティを見られる・参加できる（lib/ageGate.userCohort）。null で外す
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const userId = String(body.userId || '');
  const user = userId ? await db.getUser(userId) : null;
  if (!user) return NextResponse.json({ error: 'not_found', message: '会員が見つかりません' }, { status: 404, headers: noStore });
  const patch: Record<string, unknown> = {};
  if ('age' in body) {
    const age = Math.floor(Number(body.age));
    if (!Number.isFinite(age) || age < 0 || age > 99) return NextResponse.json({ error: 'bad_age', message: '年齢は0〜99で入れてください' }, { status: 400, headers: noStore });
    patch.age = age;
  }
  if ('cohortOverride' in body) patch.cohortOverride = body.cohortOverride === 'a' ? 'a' : null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  await db.updateUser(userId, patch as any);
  try {
    const { audit, adminActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    const name = user.displayName || userId;
    const parts = [
      'age' in patch ? `年齢を ${user.age || '未入力'} → ${patch.age} に` : '',
      'cohortOverride' in patch ? (patch.cohortOverride === 'a' ? '20〜30代のコミュニティを特例で見られるように' : '20〜30代の特例を外す') : '',
    ].filter(Boolean);
    await audit({ ...(await adminActor(null)), action: AUDIT_ACTION.userAge, targetKind: 'user', targetId: userId, targetName: name, summary: `会員「${name}」の${parts.join('・')}`, detail: patch }, req);
  } catch { /* 記録できなくても変更はできている */ }
  const after = await db.getUser(userId);
  return NextResponse.json({ ok: true, age: after?.age || 0, cohortOverride: (after as any)?.cohortOverride || null }, { headers: noStore });
}
