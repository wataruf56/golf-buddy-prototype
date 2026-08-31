import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import {
  canJoinSlot, DEFAULT_FILLED_MESSAGE, isFilled, licenseSummary, officialOf,
  takenSeats, totalSeats, type License, type OfficialInfo,
} from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/official/[id]/join  { slotId, license? }
//
// 公式スレッドの枠に手を挙げる。ふつうの募集と違い**承認は要らない**（枠に空きが
// あれば即参加）。主催者がいないので、承認する人もいないため。
//
// 免許は成立してから聞くと、そこで話が止まる。だから**申し込みのこの瞬間**に聞く。
// 枠が埋まったら、運営名義の案内をチャットへ自動で流す。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const o = officialOf(round);
  if (!o) return NextResponse.json({ error: 'not_official' }, { status: 400, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const slotId = String(body?.slotId || '');
  const license = String(body?.license || '') as License;

  // 参加者の情報（枠の判定に car を使う）
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(round.applicantIds || [])).forEach((u) => { if (u) users[u.id] = u; });
  } catch { /* noop */ }
  const me = await db.getUser(meId);

  const check = canJoinSlot(round, slotId, me || undefined, users);
  if (!check.ok) {
    return NextResponse.json({ ok: false, reason: check.reason, message: check.message }, { status: 409, headers: noStore });
  }
  if (o.askLicense && !['have', 'paper', 'none'].includes(license)) {
    return NextResponse.json({ ok: false, message: '運転免許について選んでください' }, { status: 400, headers: noStore });
  }

  const applicantIds = Array.from(new Set([...(round.applicantIds || []), meId]));
  const next: OfficialInfo = {
    ...o,
    slotOf: { ...(o.slotOf || {}), [meId]: slotId },
    ...(o.askLicense ? { license: { ...(o.license || {}), [meId]: license } } : {}),
  };

  const filled = applicantIds.length >= totalSeats(round);
  if (filled) next.stage = 'deciding';

  await db.updateRound(round.id, {
    applicantIds,
    currentCount: applicantIds.length,
    official: next,
    ...(filled ? { status: 'closed' as const } : {}),
  } as any);

  // チャットへ「◯◯さんが参加しました」＋歓迎の一言。
  // 埋まったときの案内より**先**に流す（入った→そろった、の順で読めるように）。
  try {
    const { postJoinMessages } = await import('@/lib/joinWelcome');
    await postJoinMessages(round, me, applicantIds.length, totalSeats(round));
  } catch (e) {
    console.error('[official join] welcome failed (non-fatal)', e);
  }

  // 枠が埋まった瞬間に、運営から案内を1回だけ流す。
  if (filled && !o.filledNotifiedAt) {
    try {
      (await db.listUsers(applicantIds)).forEach((u) => { if (u) users[u.id] = u; });
      const { getSettings } = await import('@/lib/officialSettings');
      const st = await getSettings();
      await db.addRoundMessage(round.id, ADMIN_MANAGER_ID, st.filledMessage || DEFAULT_FILLED_MESSAGE);
      if (next.askLicense) {
        const sum = licenseSummary(next, applicantIds, users);
        if (sum) {
          await db.addRoundMessage(round.id, ADMIN_MANAGER_ID,
            `🚗 運転免許（申し込みのときの回答）\n${sum}`);
        }
      }
      await db.updateRound(round.id, { official: { ...next, filledNotifiedAt: Date.now() } } as any);

      // 全員に「そろいました」を知らせる
      const { addNotification } = await import('@/lib/notifications');
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      const { pushTo, liffUrl } = await import('@/lib/linePush');
      const link = `/round/${round.id}/decide`;
      const text = `🎉 「${round.title}」に${applicantIds.length}人そろいました。日程とコースを決めましょう`;
      await Promise.all(applicantIds.map(async (uid) => {
        await addNotification(uid, 'applyApproved', text, link);
        if (isNotifyEnabled(users[uid], 'applyApproved')) {
          pushTo(uid, text, liffUrl(link), 'official_filled').catch(() => {});
        }
      }));
    } catch (e) {
      console.error('[official join] filled notice failed (non-fatal)', e);
    }
  }

  // 出入りのログ。誰がいつどのグループに入ったかを管理画面で追えるようにする。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」に入った`,
      detail: { by: 'self', slotId, ...(o.askLicense ? { license } : {}), seats: `${applicantIds.length}/${totalSeats(round)}`, official: true },
    }, req);
  } catch { /* ログの失敗で参加を止めない */ }

  return NextResponse.json({
    ok: true, filled, taken: applicantIds.length, total: totalSeats(round),
  }, { headers: noStore });
}
