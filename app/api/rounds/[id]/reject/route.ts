import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  const wasPending = (round.pendingApplicantIds || []).includes(userId);
  const updated = await db.rejectApplicant(params.id, userId);
  // 見送りを記録し、申請者に知らせる（2026-10-11）。申請者は「参加予定」の「申請の状況」で結果を見られる
  if (wasPending) {
    const list = ((round as any).rejectedApplicants || []).filter((e: any) => e?.userId !== userId);
    const rejectedApplicants = [...list, { userId, at: Date.now() }].slice(-200);
    try { await db.updateRound(params.id, { rejectedApplicants } as any); (updated as any).rejectedApplicants = rejectedApplicants; } catch { /* 記録に失敗しても見送り自体は成立 */ }
    try {
      const { addNotification } = await import('@/lib/notifications');
      const title = round.title || round.courseName || 'ラウンド';
      await addNotification(userId, 'applyDeclined' as any, `📨 「${title}」への参加申請は、今回は見送りとなりました。ほかの募集もぜひ探してみてください。`, '/rounds/upcoming');
    } catch { /* noop */ }
  }
  return NextResponse.json({ round: updated });
}
