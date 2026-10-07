import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { hasGenderBreakdown } from '@/lib/genderSlots';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/waitlist/approve { userId }
// 主催者（共同管理者）のみ。空き待ちの人を「枠を1つ増やして承認」する（2026-10-07）。
// その人の性別の枠（内訳があれば）と募集人数を +1 し、申請→承認の通常ルートに乗せる（通知・歓迎の一言・ログも同じ）。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const userId = String(body?.userId || '');
  const entry = (round.waitlist || []).find((e) => e.userId === userId);
  if (!entry) return NextResponse.json({ error: 'not_waiting', message: 'この人は空き待ちしていません' }, { status: 404, headers: noStore });
  if ((round.applicantIds || []).includes(userId)) return NextResponse.json({ error: 'already_member' }, { status: 400, headers: noStore });

  const nextMax = Math.min(50, (round.maxSpots || 1) + 1);
  const patch: Record<string, unknown> = {
    maxSpots: nextMax,
    isCompetition: nextMax >= 5,
    waitlist: (round.waitlist || []).filter((e) => e.userId !== userId),
  };
  if (hasGenderBreakdown(round)) {
    if (entry.gender === 'male') patch.spotsMale = (round.spotsMale || 0) + 1;
    else patch.spotsFemale = (round.spotsFemale || 0) + 1;
  }
  await db.updateRound(params.id, patch as any);
  if (!(round.pendingApplicantIds || []).includes(userId)) await db.joinRound(params.id, userId);
  const updated = await db.approveApplicant(params.id, userId);

  // 本人へ：承認の通知（通常の承認と同じ文面・同じ設定に従う）
  try {
    const applicant = await db.getUser(userId);
    const link = `/round/${params.id}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    const n = await renderNotif('applyApproved', { '募集タイトル': round.title });
    const { addNotification } = await import('@/lib/notifications');
    if (n.inApp) addNotification(userId, 'applyApproved', n.inApp, link).catch(() => {});
    if (isNotifyEnabled(applicant as any, 'applyApproved')) {
      pushTo(userId, n.line, liffUrl(link), 'approved').catch(() => {});
      webPushText(userId, n.webTitle, n.webBody, link, `approve-${params.id}`).catch(() => {});
    }
  } catch { /* non-fatal */ }
  try {
    const { postJoinMessages } = await import('@/lib/joinWelcome');
    const joined = await db.getUser(userId);
    await postJoinMessages({ ...round, maxSpots: nextMax }, joined, updated?.currentCount || 0, nextMax);
  } catch (e) { console.error('[waitlist approve] welcome failed (non-fatal)', e); }
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(userId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」に入った（空き待ちから枠を増やして承認）`,
      detail: { by: 'host', hostId: meId, seats: `${updated?.currentCount ?? ''}`, slot: entry.gender },
    }, req);
  } catch { /* noop */ }

  return NextResponse.json({ ok: true, round: updated }, { headers: noStore });
}
