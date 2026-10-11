import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// GET /api/me/round-photo-counts?ids=a,b,c … 自分が参加した募集のアルバムの写真の枚数（2026-10-11）
// 「過去のラウンド」タブで、写真がある募集に 📷 を出すため。自分が主催・参加した募集だけ数える。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ counts: {} }, { status: 401, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ counts: {} }, { headers: noStore });
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const counts: Record<string, number> = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const r = (await adb.collection('rounds').doc(id).get()).data();
      if (!r) return;
      const member = r.hostId === meId || (r.coHostIds || []).includes(meId) || (r.applicantIds || []).includes(meId);
      if (!member) return;
      const agg = await adb.collection('rounds').doc(id).collection('photos').count().get();
      const n = Number(agg.data()?.count || 0);
      if (n > 0) counts[id] = n;
    } catch { /* noop */ }
  }));
  return NextResponse.json({ counts }, { headers: noStore });
}
