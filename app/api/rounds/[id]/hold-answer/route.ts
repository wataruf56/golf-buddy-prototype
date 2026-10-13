import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';

// POST /api/rounds/[id]/hold-answer { answer: 'wait' | 'cant' } … 保留のお知らせへの申請者の答え（2026-10-13・lib/roundHold）
//   wait … 「⏳ 待つ」。holds[me].answer='wait' を記録（主催者の一覧に「⏳「待つ」と回答」）
//   cant … 「待てない」。この募集への参加申請を取り消す（/leave の申請取り下げと同じ処理）。
//          主催者・共同管理者には**アプリ内のお知らせだけ**（LINE は送らない）。取りやめの記録に holdCant を付ける。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const answer = body.answer === 'wait' || body.answer === 'cant' ? body.answer as 'wait' | 'cant' : null;
  if (!answer) return NextResponse.json({ error: 'invalid', message: '答えが選ばれていません' }, { status: 400, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found', message: '募集が見つかりません' }, { status: 404, headers: noStore });
  const { activeHoldOf, holdCantHostText } = await import('@/lib/roundHold');
  const { stripRoundForViewer } = await import('@/lib/roundView');
  const hold = activeHoldOf(round, meId);
  if (!hold) {
    // すでに承認・見送り・取り下げ済み（画面が古い）。いまの状態を返して画面を合わせる
    return NextResponse.json({ error: 'no_hold', message: 'この申請はもう保留中ではありません', round: stripRoundForViewer(round, meId) }, { status: 409, headers: noStore });
  }

  if (answer === 'wait') {
    await db.patchApplicantHold(params.id, meId, { answer: 'wait', answeredAt: Date.now() });
    const updated = await db.getRound(params.id);
    return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
  }

  // 待てない → 申請の取り消し（db.leaveRound が holds[me] も消す・lib/roundMembership）
  const updated = await db.leaveRound(params.id, meId);
  let cancellations = round.cancellations || [];
  // 運営が代理で立てた枠（主催者＝運営アカウント）は、抜けても誰にも知らせない約束（/leave と同じ）
  if (round.hostId !== ADMIN_MANAGER_ID) {
    const me = await db.getUser(meId);
    const name = me?.displayName || 'メンバー';
    cancellations = [...cancellations, { userId: meId, name, reason: 'withdraw', wasApproved: false, holdCant: true, at: Date.now() }];
    try { await db.updateRound(params.id, { cancellations } as any); } catch { /* 記録に失敗しても取り消しは成立 */ }
    try {
      const targets = Array.from(new Set([round.hostId, ...(round.coHostIds || [])])).filter((x) => x && x !== meId);
      const { addNotificationMany } = await import('@/lib/notifications');
      await addNotificationMany(targets, 'participantLeft', holdCantHostText(name, round.title || round.courseName || 'ラウンド'), `/round/${round.id}`);
    } catch (e) { console.warn('[hold-answer] notify host failed (non-fatal)', (e as Error).message); }
  }

  // 出入りのログ（/leave と同じ action）
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupLeave,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: round.id, targetName: round.title,
      summary: `「${round.title}」を抜けた（保留に「待てない」）`,
      detail: { by: 'self', seats: `${updated?.currentCount ?? ''}`, official: !!(round as any).official, holdCant: true },
    }, req);
  } catch { /* ログの失敗で取り消しを止めない */ }

  return NextResponse.json({ ok: true, withdrawn: true, round: stripRoundForViewer({ ...updated, cancellations } as any, meId) }, { headers: noStore });
}
