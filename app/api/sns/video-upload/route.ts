import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { snsAllowed } from '@/lib/snsTest';
import { videoUploadUrl } from '@/lib/snsTestMedia';

// POST /api/sns/video-upload { kind: 'p'|'s', contentType, size } … 動画のアップロード先を返す（テスト版・運営だけ・lib/snsTestMedia）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';
const MESSAGES: Record<string, string> = { bad_type: 'この形式の動画は使えません（mp4 / mov / webm）', too_large: '動画は200MBまでです' };

export async function POST(req: Request) {
  const meId = await getMeId();
  if (!(await snsAllowed(meId))) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const body = await req.json().catch(() => ({}));
  try {
    const r = await videoUploadUrl(meId!, body?.kind === 's' ? 's' : 'p', String(body?.contentType || ''), Number(body?.size) || 0);
    return NextResponse.json(r, { headers: noStore });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: m, message: MESSAGES[m] || 'うまくいきませんでした' }, { status: MESSAGES[m] ? 400 : 500, headers: noStore });
  }
}
