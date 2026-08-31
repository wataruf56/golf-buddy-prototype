import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  // 共同管理者は主催者と同権限の固定メンバー。参加者一覧から「外す」ことはできない。
  if ((round.coHostIds || []).includes(userId)) {
    return NextResponse.json({ error: 'cannot_kick_cohost', message: '共同管理者は外せません' }, { status: 400 });
  }
  const updated = await db.kickApplicant(params.id, userId);

  // 出入りのログ。自分から抜けたのか外されたのかが後で分かるように by を残す。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupLeave,
      ...(await userActor(userId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」から外された`,
      detail: { by: 'host', hostId: meId, seats: `${updated?.currentCount ?? ''}` },
    }, req);
  } catch { /* ログの失敗で操作を止めない */ }

  return NextResponse.json({ round: updated });
}
