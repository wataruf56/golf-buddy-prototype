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
    // 本人にアプリ内のお知らせ＋LINE（通知設定「📨 申請が見送られた」がONのとき）（2026-10-11）
    try {
      const title = round.title || round.courseName || 'ラウンド';
      const text = `📨 「${title}」への参加申請は、今回は見送りとなりました。ほかの募集もぜひ探してみてください。`;
      const { addNotification } = await import('@/lib/notifications');
      await addNotification(userId, 'applyDeclined' as any, text, '/search');
      const applicant = await db.getUser(userId);
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (applicant && isNotifyEnabled(applicant as any, 'applyDeclined' as any)) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        await pushTo(userId, text, liffUrl('/search'), 'declined');
      }
    } catch { /* noop */ }
  }
  return NextResponse.json({ round: updated });
}
