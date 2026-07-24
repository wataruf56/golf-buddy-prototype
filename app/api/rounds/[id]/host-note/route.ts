import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/host-note  { note }
// 主催者からの連絡（注意事項・ルール等）を保存。主催者のみ。参加者は閲覧のみ。
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ編集できます' }, { status: 403, headers: noStore });
  }
  let body: any = {};
  try { body = await req.json(); } catch {}
  const note = String(body?.note ?? '').slice(0, 4000);
  await db.updateRound(params.id, { hostNote: note } as any);
  return NextResponse.json({ ok: true, hostNote: note }, { headers: noStore });
}
