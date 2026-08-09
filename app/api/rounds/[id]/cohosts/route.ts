import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { addNotification } from '@/lib/notifications';

const noStore = { 'Cache-Control': 'no-store' };

// POST /api/rounds/[id]/cohosts — { userId, on }
// 既存ラウンドの共同管理者を後から追加(on=true)/解除(on=false)する。主催者・共同管理者のみ。
//
// 追加:
//   - coHostIds に加える（主催者本人・重複は不可）。
//   - まだ参加者(applicantIds)でなければ、承認済み参加者として登録し currentCount / maxSpots を +1
//     （共同管理者は主催者側の固定メンバー扱い＝募集枠を減らさない）。pending にいたら外す。
// 解除:
//   - coHostIds から外すだけ。参加者(applicantIds)としては残す（通常の参加者に降格）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者・共同管理者のみ操作できます' }, { status: 403, headers: noStore });
  }
  if (round.status === 'completed') {
    return NextResponse.json({ error: 'completed', message: '完了した募集は編集できません' }, { status: 400, headers: noStore });
  }

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const userId = String(body?.userId || '');
  const on = body?.on !== false; // 既定 true（追加）
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  if (userId === round.hostId) {
    return NextResponse.json({ error: 'is_host', message: 'この人はすでに主催者です' }, { status: 400, headers: noStore });
  }

  const coHostIds = [...(round.coHostIds || [])];
  const patch: Partial<import('@/lib/types').Round> = {};

  if (on) {
    const target = await db.getUser(userId);
    if (!target) return NextResponse.json({ error: 'no_user', message: '相手が見つかりません' }, { status: 404, headers: noStore });
    if (!coHostIds.includes(userId)) coHostIds.push(userId);
    patch.coHostIds = coHostIds;

    const applicantIds = [...(round.applicantIds || [])];
    const pending = (round.pendingApplicantIds || []).filter((x) => x !== userId);
    if (pending.length !== (round.pendingApplicantIds || []).length) patch.pendingApplicantIds = pending;
    if (!applicantIds.includes(userId)) {
      // 新たに参加者(承認済み)として登録。空き枠があればそれを使い、満員なら定員を広げる。
      applicantIds.push(userId);
      patch.applicantIds = applicantIds;
      const nextCount = (round.currentCount || 1) + 1;
      patch.currentCount = nextCount;
      const isDrink = round.eventType === 'drink';
      if (nextCount > (round.maxSpots || 0)) patch.maxSpots = Math.min(isDrink ? 99 : 50, nextCount);
    }

    await db.updateRound(params.id, patch);
    // 本人へ通知（アプリ内）。
    try {
      const host = await db.getUser(round.hostId);
      const hostName = host?.displayName || '主催者';
      await addNotification(userId, 'invited', `「${round.title}」の共同管理者になりました（${hostName}さんと同じ管理権限で編集・承認などができます）`, `/round/${params.id}`);
    } catch { /* 通知失敗は本処理を妨げない */ }
  } else {
    patch.coHostIds = coHostIds.filter((x) => x !== userId);
    await db.updateRound(params.id, patch);
  }

  const updated = await db.getRound(params.id);
  return NextResponse.json({ round: updated }, { headers: noStore });
}
