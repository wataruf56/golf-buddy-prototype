import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/payments
//   { userId, paid }          … その人の入金チェックを ON/OFF（主催者・共同管理者のみ）
//   { paymentNote }           … 入金案内（金額・振込先など）を保存
//   { paymentEnabled }        … 入金管理機能そのものの ON/OFF
// 参加者はラウンド本体（GET）から paidIds を見られる＝誰が入金済みかは全員に可視。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者・共同管理者のみ操作できます' }, { status: 403, headers: noStore });
  }

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  const patch: Partial<import('@/lib/types').Round> = {};

  // 入金案内の保存
  if (Object.prototype.hasOwnProperty.call(body, 'paymentNote')) {
    patch.paymentNote = String(body.paymentNote ?? '').slice(0, 500);
  }
  // 機能そのもののON/OFF（あとから有効化・無効化できる）
  if (Object.prototype.hasOwnProperty.call(body, 'paymentEnabled')) {
    patch.paymentEnabled = !!body.paymentEnabled;
  }
  // 個別メンバーの入金チェック
  if (body.userId) {
    const userId = String(body.userId);
    // 対象は「このラウンドのメンバー」だけ（主催者・共同管理者・承認済み参加者・名前付きゲスト）。
    const members = new Set<string>([
      round.hostId,
      ...(round.coHostIds || []),
      ...(round.applicantIds || []),
      ...((round.guests || []).map((g) => g.id)),
    ].filter(Boolean));
    if (!members.has(userId)) {
      return NextResponse.json({ error: 'not_member', message: 'このラウンドの参加者ではありません' }, { status: 400, headers: noStore });
    }
    const cur = new Set(round.paidIds || []);
    if (body.paid === false) cur.delete(userId); else cur.add(userId);
    patch.paidIds = Array.from(cur);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
  }

  await db.updateRound(params.id, patch as any);
  const updated = await db.getRound(params.id);
  return NextResponse.json({ round: updated }, { headers: noStore });
}
