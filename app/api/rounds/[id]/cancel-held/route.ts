import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/cancel-held … 主催者が「ラウンド中止」を選ぶ（2026-10-11）
// 雨天・人数不足などで実施しなかった募集を片付ける。完了扱いにはしない（参加者へのレビュー依頼は出さない）。
// 状態は締切（closed）にして heldCancelledAt を打つ。完了確認の通知・画面の「未完了」ゲートの対象から外れる。
// 参加者（主催者以外）にはアプリ内のお知らせだけ送る。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  if (round.status === 'completed') return NextResponse.json({ error: 'already_completed', message: 'すでに完了しています' }, { status: 400, headers: noStore });
  if ((round as any).heldCancelledAt) return NextResponse.json({ ok: true, already: true }, { headers: noStore });
  await db.updateRound(params.id, { status: 'closed', heldCancelledAt: Date.now() } as any);
  try {
    const ids = Array.from(new Set((round.applicantIds || []).filter((id) => id && id !== meId && id !== round.hostId)));
    const title = round.title || round.courseName || 'ラウンド';
    const { addNotificationMany } = await import('@/lib/notifications');
    await addNotificationMany(ids, 'roundUpcoming' as any, `☔ 「${title}」は主催者が「中止」にしました。`, `/round/${params.id}`);
  } catch { /* noop */ }
  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
