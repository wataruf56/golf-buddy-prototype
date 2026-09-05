import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import {
  canJoinSlot, DEFAULT_FILLED_MESSAGE, isFilled, licenseSummary, officialOf,
  slotStates, takenSeats, totalSeats, type License, type OfficialInfo,
} from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/official/[id]/join  { slotId?, license? }
//
// 公式スレッドに手を挙げる。ふつうの募集と違い**承認は要らない**（空きがあれば即参加）。
// 主催者がいないので、承認する人もいないため。
//
// slotId は**省略できる**。会員には枠の内訳（女性2・男性2…）を見せないので、
// 押せるボタンは「参加する」1つだけ。どの席に座るかは性別と車の有無から
// こちらで決める。slotId が来たときは今まで通りその席に座らせる。
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

  // 席を決める。指定が無ければ、この人が座れる席を先頭から探す。
  // 見つからないときは「なぜ入れないか」を、いちばん具体的な理由で返す
  // （どの席も満席なら満席、性別で弾かれているならそう言う）。
  let seat = slotId;
  if (!seat) {
    const states = slotStates(round, users);
    const fit = states.find((st) => st.left > 0 && canJoinSlot(round, st.slot.id, me || undefined, users).ok);
    if (!fit) {
      const reasons = states.map((st) => canJoinSlot(round, st.slot.id, me || undefined, users))
        .filter((r): r is Exclude<typeof r, { ok: true }> => !r.ok);
      const pick = reasons.find((r) => r.reason === 'need_car')
        || reasons.find((r) => r.reason === 'gender')
        || reasons[0];
      return NextResponse.json(
        { ok: false, reason: pick?.reason || 'full', message: pick?.message || 'いまは空きがありません' },
        { status: 409, headers: noStore },
      );
    }
    seat = fit.slot.id;
  }

  const check = canJoinSlot(round, seat, me || undefined, users);
  if (!check.ok) {
    return NextResponse.json({ ok: false, reason: check.reason, message: check.message }, { status: 409, headers: noStore });
  }
  if (o.askLicense && !['have', 'paper', 'none'].includes(license)) {
    return NextResponse.json({ ok: false, message: '運転免許について選んでください' }, { status: 400, headers: noStore });
  }

  const applicantIds = Array.from(new Set([...(round.applicantIds || []), meId]));
  const next: OfficialInfo = {
    ...o,
    slotOf: { ...(o.slotOf || {}), [meId]: seat },
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

  // 以前はここで「◯◯さんが参加しました」を毎回チャットへ流していたが、やめた。
  // そろうまで顔ぶれを伏せる方針にしたので、チャット自体が**そろってから**始まる。
  // 途中で名前を流すと、伏せている意味がなくなる。
  // 代わりに、そろった瞬間に全員をまとめて紹介する（下の filled のところ）。

  // 枠が埋まった瞬間に、運営から案内を1回だけ流す。
  // 中身は代理参加の経路と共通（片方にしか無いと、そちらから最後の1人が
  // 入ったときに誰にも知らされない）。
  if (filled && !o.filledNotifiedAt) {
    try {
      const { onOfficialFilled } = await import('@/lib/officialFilled');
      await onOfficialFilled(round, next, applicantIds);
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
      detail: { by: 'self', slotId: seat, ...(o.askLicense ? { license } : {}), seats: `${applicantIds.length}/${totalSeats(round)}`, official: true },
    }, req);
  } catch { /* ログの失敗で参加を止めない */ }

  return NextResponse.json({
    ok: true, filled, taken: applicantIds.length, total: totalSeats(round),
  }, { headers: noStore });
}
