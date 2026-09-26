import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (isRoundHost(round, meId)) return NextResponse.json({ error: 'host_cannot_leave' }, { status: 400 });

  // 取りやめの理由（参加確定の人だけ画面で聞く。申請中の取り下げは理由なし）。
  let body: any = {};
  try { body = await req.json(); } catch { /* 本文なしでも抜けられる */ }
  const wasApproved = (round.applicantIds || []).includes(meId);
  const wasPending = (round.pendingApplicantIds || []).includes(meId);
  const { isLeaveReason, leaveReasonLabel } = await import('@/lib/leaveReasons');
  const reasonRaw = String(body?.reason || '');
  const reason = wasApproved ? (isLeaveReason(reasonRaw) ? reasonRaw : 'other') : 'withdraw';
  const text = String(body?.text || '').trim().slice(0, 300);

  const updated = await db.leaveRound(params.id, meId);

  // 記録して、主催者と共同管理者に知らせる。
  // 運営が代理で立てた枠（主催者＝運営アカウント）は、抜けても誰にも知らせない約束なので除く。
  let cancellations = round.cancellations || [];
  if ((wasApproved || wasPending) && round.hostId !== ADMIN_MANAGER_ID) {
    const me = await db.getUser(meId);
    const name = me?.displayName || 'メンバー';
    cancellations = [...cancellations, {
      userId: meId, name, reason, ...(text ? { text } : {}), wasApproved, at: Date.now(),
    }];
    try { await db.updateRound(params.id, { cancellations } as any); } catch { /* 記録に失敗しても退出は成立 */ }

    try {
      const targets = Array.from(new Set([round.hostId, ...(round.coHostIds || [])])).filter((x) => x && x !== meId);
      const link = `/round/${round.id}`;
      const why = wasApproved ? `（理由：${leaveReasonLabel(reason)}${text ? `／${text}` : ''}）` : '';
      const msg = wasApproved
        ? `🚪 ${name}さんが「${round.title}」の参加をキャンセルしました${why}`
        : `↩️ ${name}さんが「${round.title}」への参加申請を取り下げました`;
      const { addNotification } = await import('@/lib/notifications');
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      const { webPushText } = await import('@/lib/webPush');
      const hosts = await db.listUsers(targets);
      await Promise.all(targets.map(async (uid) => {
        await addNotification(uid, 'participantLeft', msg, link).catch(() => {});
        const h = hosts.find((x) => x?.id === uid);
        if (isNotifyEnabled(h as any, 'participantLeft')) {
          pushTo(uid, msg, liffUrl(link), 'participantLeft').catch(() => {});
          webPushText(uid, '参加のキャンセル', msg, link, `left-${round.id}-${meId}`).catch(() => {});
        }
      }));
    } catch (e) { console.warn('[leave] notify host failed (non-fatal)', (e as Error).message); }
  }

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

  return NextResponse.json({ round: { ...updated, cancellations } });
}
