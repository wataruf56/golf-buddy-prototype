import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';

// POST /api/rounds/[id]/visibility { visibility: 'public' | 'invite' } … 公開範囲を切り替える（主催者のみ）。
//   'public' … 非公開の招待を「みんなに公開」に（2026-10-14）。希望条件の通知は送らない。
//   'invite' … 公開していた募集を「招待した人だけ」に（2026-10-15 本人判断で両方向に）。以後は、主催者・共同管理者・
//              参加者・申請中・招待中（＋招待されたことがある人・出欠に答えた人）だけが見られる（lib/roundAccess）。
//              「気になる」を押していただけの人・見に来ただけの人からは見えなくなる。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden', message: '主催者だけが切り替えられます' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  if (body.visibility !== 'public' && body.visibility !== 'invite') return NextResponse.json({ error: 'bad_request', message: '公開範囲を選んでください' }, { status: 400, headers: noStore });
  if (round.status === 'completed') return NextResponse.json({ error: 'completed', message: '完了した募集は切り替えられません' }, { status: 400, headers: noStore });
  if ((round as any).official || (round as any).availDate) return NextResponse.json({ error: 'unsupported', message: 'この募集は公開範囲を変えられません' }, { status: 400, headers: noStore });
  const next = body.visibility === 'invite' ? 'invite' : 'public';
  if ((round.visibility === 'invite' ? 'invite' : 'public') !== next) await db.updateRound(params.id, { visibility: next } as any);
  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
