import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// POST /api/rounds/[id]/invite-seen
// ホームの「ラウンドに招待されています」が表示されたとき、招待の既読（round.inviteSeenAt[本人]）を打つ（2026-10-13）。
// 募集ページを開いたときは /api/rounds/[id]/view が同じことをする（ここは呼ばない）。
// 招待中で、今回の招待のあとにまだ打っていないときだけ書く（何度呼ばれても1回だけ）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ ok: true, recorded: false }, { headers: noStore });
  try {
    const recorded = await db.markInviteSeen(params.id, meId, Date.now());
    return NextResponse.json({ ok: true, recorded }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: true, recorded: false }, { headers: noStore });
  }
}
