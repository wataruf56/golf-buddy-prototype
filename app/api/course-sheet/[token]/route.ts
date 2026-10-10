import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// GET /api/course-sheet/<token> … 主催者が作った組分け画像を返す（24時間まで）。lib は POST 側の説明参照。
// ログインなしで開ける（外部ブラウザで開くため）。URL は推測できない乱数で、24時間を過ぎたら 404。
export const dynamic = 'force-dynamic';
const TTL = 24 * 60 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const adb = getAdminDb() as any;
  if (!adb || !/^[A-Za-z0-9_-]{16,40}$/.test(params.token)) return new NextResponse('not found', { status: 404 });
  const snap = await adb.collection('_courseSheets').doc(params.token).get();
  if (!snap.exists) return new NextResponse('not found', { status: 404 });
  const d = snap.data() || {};
  if (!d.b64 || Date.now() - (d.createdAt || 0) > TTL) {
    try { await snap.ref.delete(); } catch { /* noop */ }
    return new NextResponse('この画像の保存期限（24時間）が過ぎました。アプリでもう一度「画像で保存」を押してください。', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const buf = Buffer.from(String(d.b64), 'base64');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': d.type === 'jpeg' ? 'image/jpeg' : 'image/png',
      'Content-Disposition': 'inline; filename="kumiwake.png"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
