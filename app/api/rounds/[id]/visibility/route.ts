import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';

// POST /api/rounds/[id]/visibility { visibility: 'public' } … 非公開の招待を「みんなに公開」に切り替える（主催者のみ・2026-10-14）。
// 逆（公開 → 招待限定）はできない（すでに見た人がいるため）。切り替えても、希望条件の通知は送らない。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden', message: '主催者だけが切り替えられます' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  if (body.visibility !== 'public') return NextResponse.json({ error: 'bad_request', message: '「みんなに公開」への切り替えだけできます' }, { status: 400, headers: noStore });
  if (round.visibility === 'invite') await db.updateRound(params.id, { visibility: 'public' } as any);
  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
