import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';

// 写真の削除。アップロードした本人 or ラウンド主催者のみ。
const noStore = { 'Cache-Control': 'no-store' };

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; photoId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ ok: true }, { headers: noStore });

  const photos = await db.listRoundPhotos(params.id);
  const target = photos.find((p) => p.id === params.photoId);
  if (!target) return NextResponse.json({ ok: true }, { headers: noStore }); // already gone
  if (target.uploadedBy !== meId && !isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '自分の写真か、主催者だけが削除できます' }, { status: 403, headers: noStore });
  }
  await db.deleteRoundPhoto(params.id, params.photoId);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
