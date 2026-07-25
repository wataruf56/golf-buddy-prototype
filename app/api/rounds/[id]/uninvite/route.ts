import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/uninvite  body: { userId }
// 主催者が送った招待を取り消す（invitedIds から外す）。相手が既に参加確定/申請中の
// 場合はこの経路では外さない（その場合は kick/reject を使う）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (existing.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '募集者のみ操作できます' }, { status: 403, headers: noStore });
  }

  let userId = '';
  try { const body = await req.json(); userId = String(body?.userId || '').trim(); } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400, headers: noStore });

  const round = await db.uninviteFromRound(params.id, userId);
  return NextResponse.json({ round }, { headers: noStore });
}
