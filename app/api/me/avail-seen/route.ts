import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// 下のタブ「行ける日」を開いた、の記録（2026-10-14）。
// users.availSeenAt に今の時刻を置く。これより後にほかの人が押した日が、タブの①②バッジになる（lib/availability.countNewAvailFor）。
// 別の端末で開いてもバッジが消えるよう、端末ではなくサーバーに持つ（端末の localStorage は予備）。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const at = Date.now();
  try { await db.updateUser(meId, { availSeenAt: at } as any); } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true, at }, { headers: noStore });
}
