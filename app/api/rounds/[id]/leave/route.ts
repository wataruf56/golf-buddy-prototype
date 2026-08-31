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

  // 管理者の代理ラウンド募集で、抜けたのが**車を出す人**だった場合。
  // 枠は解散させず、同じ駅で車を出せる別の人へ声をかけ直す。
  // 参加者はその駅で拾ってもらう前提で集まっているので、解散は最後の手段。
  try {
    const { onDriverLeft } = await import('@/lib/proxyRecruit');
    const asked = await onDriverLeft(round, meId);
    if (asked) console.log(`[leave] driver left ${round.id} → asked ${asked} candidates`);
  } catch (e) {
    console.error('[leave] driver replacement failed (non-fatal)', (e as Error).message);
  }

  return NextResponse.json({ round: updated });
}
