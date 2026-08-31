import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (isRoundHost(round, meId)) return NextResponse.json({ error: 'host_cannot_leave' }, { status: 400 });
  const updated = await db.leaveRound(params.id, meId);

  // 出入りのログ。誰がいつどのグループを抜けたかを管理画面で追えるようにする。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupLeave,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」を抜けた`,
      // 「どれくらい居たか」は入った側のログと突き合わせて画面で出す（ここでは持たない）
      detail: {
        by: 'self',
        seats: `${updated?.currentCount ?? ''}`,
        official: !!(round as any).official,
      },
    }, req);
  } catch { /* ログの失敗で退出を止めない */ }

  return NextResponse.json({ round: updated });
}
