import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { paymentSig } from '@/lib/paymentNotice';

// POST /api/rounds/[id]/payment-ack … 事前入金の条件（金額・入金期日）を確認した（2026-10-11）
// 参加者（承認済み・申請中）だけ。round.paymentAcks[userId] = いまの条件の印（lib/paymentNotice.paymentSig）。
// 主催者が金額や期日を変えると印が変わるので、参加者にもう一度確認が出る（components/PaymentAckGate）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const member = (round.applicantIds || []).includes(meId) || (round.pendingApplicantIds || []).includes(meId);
  if (!member) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const sig = paymentSig(round as any);
  if (!sig) return NextResponse.json({ ok: true, sig: '' }, { headers: noStore });
  const acks = { ...(((round as any).paymentAcks || {}) as Record<string, string>), [meId]: sig };
  await db.updateRound(params.id, { paymentAcks: acks } as any);
  return NextResponse.json({ ok: true, sig }, { headers: noStore });
}
