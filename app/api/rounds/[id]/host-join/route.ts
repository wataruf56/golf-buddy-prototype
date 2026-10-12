import { NextRequest, NextResponse } from 'next/server';
import { db, HostJoinError } from '@/lib/db';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/host-join  { join: boolean }  ★主催者（hostId）本人だけ★（2026-10-12）
//
// ゴルトモ公式として立てた募集（hostNotCounted）は、主催者（運営）を参加人数に数えない。
// でも運営本人がプレーしたいときもある（例：12/13 の公式コンペ）。別アカウントで申請させるのではなく、
// 募集画面の「わたしも参加する」で主催者本人をふつうの参加者として数えるようにする（hostJoined）。
// 「参加をやめる」で元の「運営として残る（数えない）」に戻す。
//
// 共同管理者は最初から参加者（applicantIds）なので対象外。人数の数え方は lib/hostCount、
// できる／できないの判定は lib/hostJoin、書き込みは db.setHostJoined（トランザクション）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const before = await db.getRound(params.id);
  if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (before.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者本人だけが操作できます' }, { status: 403, headers: noStore });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* 本文なしは不正 */ }
  if (typeof body?.join !== 'boolean') {
    return NextResponse.json({ error: 'bad_request', message: 'join を true / false で指定してください' }, { status: 400, headers: noStore });
  }
  const join: boolean = body.join;

  let updated;
  try {
    updated = await db.setHostJoined(params.id, join);
  } catch (e) {
    if (e instanceof HostJoinError) {
      return NextResponse.json({ error: e.code, message: e.message }, { status: e.code === 'full' || e.code === 'gender_full' ? 409 : 400, headers: noStore });
    }
    console.error('[host-join] failed', (e as Error).message);
    return NextResponse.json({ error: 'failed', message: '更新に失敗しました。時間をおいて再度お試しください。' }, { status: 500, headers: noStore });
  }

  // 主催者が抜けて枠が空いたら、空き待ちの人へ「空きが出ました」（leave と同じ。通知は既存の口を通す）
  if (!join && before.hostJoined) {
    try { const { notifyWaitlistIfOpened } = await import('@/lib/genderSlotsServer'); await notifyWaitlistIfOpened(before, updated); } catch { /* noop */ }
  }

  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ round: stripRoundForViewer(updated, meId) }, { headers: noStore });
}
