import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { canJoinSlot, officialOf, slotStates, totalSeats } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 管理者の代理ラウンド募集：参加者のワンタップ参加。
//
// 「予定が合えば行きたい」を押したら、**枠を選ばせずにそのまま入れて**
// グループチャットへ送る。運営が枠まで用意しているのに、参加する側に
// 「どの席か」を選ばせると、そこで一段増えて手が止まる。
//
// 席は性別から自動で決める（男女2:2の枠なので、入れる席は基本1つに決まる）。
// 決められないときだけ、通常の詳細画面に戻して選んでもらう。

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const roundId = String(body?.roundId || '');
  if (!roundId) return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });

  const round = await db.getRound(roundId);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const o = officialOf(round);
  if (!o) return NextResponse.json({ error: 'not_official' }, { status: 400, headers: noStore });

  // すでに入っているなら、そのままチャットへ返す（二重に入れない）。
  if ((round.applicantIds || []).includes(meId)) {
    return NextResponse.json({ ok: true, id: round.id, already: true }, { headers: noStore });
  }

  const me = await db.getUser(meId);
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(round.applicantIds || [])).forEach((u) => { if (u) users[u.id] = u; });
  } catch { /* noop */ }

  // 入れる席を探す。空きがあって、性別と役割の条件に合うものだけ。
  const states = slotStates(round, users);
  const fit = states.find((s) => s.left > 0 && canJoinSlot(round, s.slot.id, me || undefined, users).ok);
  if (!fit) {
    // 入れる席が無い（満員／性別が合わない）。理由は詳細画面が出してくれるので、そちらへ。
    const why = states.map((s) => canJoinSlot(round, s.slot.id, me || undefined, users))
      .find((c) => !c.ok) as { message?: string } | undefined;
    return NextResponse.json({
      ok: false, needsPick: true, message: why?.message || 'いまは入れる枠がありません',
    }, { status: 409, headers: noStore });
  }

  const applicantIds = Array.from(new Set([...(round.applicantIds || []), meId]));
  const filled = applicantIds.length >= totalSeats(round);
  const next = { ...o, slotOf: { ...(o.slotOf || {}), [meId]: fit.slot.id }, ...(filled ? { stage: 'deciding' as const } : {}) };

  await db.updateRound(round.id, {
    applicantIds,
    currentCount: applicantIds.length,
    official: next,
    ...(filled ? { status: 'closed' as const } : {}),
  } as any);

  // 入室のお知らせ＋歓迎。通常の参加と同じものを流す。
  try {
    const { postJoinMessages } = await import('@/lib/joinWelcome');
    await postJoinMessages(round, me, applicantIds.length, totalSeats(round));
  } catch (e) {
    console.error('[proxy join] welcome failed (non-fatal)', e);
  }

  // 出入りのログ。
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」に入った`,
      detail: { by: 'self', slotId: fit.slot.id, seats: `${applicantIds.length}/${totalSeats(round)}`, official: true, proxy: true },
    }, req);
  } catch { /* ログの失敗で参加を止めない */ }

  return NextResponse.json({
    ok: true, id: round.id, filled,
    taken: applicantIds.length, total: totalSeats(round),
  }, { headers: noStore });
}
