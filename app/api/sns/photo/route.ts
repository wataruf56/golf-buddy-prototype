import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { snsAllowed } from '@/lib/snsTest';

// GET /api/sns/photo?r=roundId&p=photoId … テスト版で見せるラウンドのアルバム写真（運営だけ）
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return new NextResponse('not found', { status: 404 });
  const q = new URL(req.url).searchParams;
  const r = q.get('r') || '', p = q.get('p') || '';
  const adb = getAdminDb() as any;
  if (!adb || !r || !p) return new NextResponse('not found', { status: 404 });
  const s = await adb.collection('rounds').doc(r).collection('photos').doc(p).get();
  const url = String(s.exists ? s.data()?.url || '' : '');
  if (/^https:\/\//.test(url)) return NextResponse.redirect(url);
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url);
  if (!m) return new NextResponse('not found', { status: 404 });
  return new NextResponse(Buffer.from(m[2], 'base64'), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=86400' } });
}
