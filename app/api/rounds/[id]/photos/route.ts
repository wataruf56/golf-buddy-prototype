import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// ラウンドの写真アルバム。参加者（主催者＋承認済み参加者）だけが閲覧・投稿できる。
// 画像はクライアントでリサイズ済みの dataURL(base64) を受け取り、rounds/{id}/photos に保存。
const noStore = { 'Cache-Control': 'no-store' };
const MAX_LEN = 1_000_000; // dataURLの上限。Firestoreドキュメント上限(約1MB)に収まるよう安全側に。

function isMember(round: any, meId: string): boolean {
  return round.hostId === meId || (round.applicantIds || []).includes(meId);
}

// GET /api/rounds/[id]/photos — 参加者のみ一覧取得。
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isMember(round, meId)) return NextResponse.json({ error: 'forbidden', message: '参加者だけが見られます' }, { status: 403, headers: noStore });
  const photos = await db.listRoundPhotos(params.id);
  return NextResponse.json({ photos }, { headers: noStore });
}

// POST /api/rounds/[id]/photos  body: { url: dataURL }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isMember(round, meId)) return NextResponse.json({ error: 'forbidden', message: '参加者だけが投稿できます' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const url = String(body?.url || '');
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(url)) {
    return NextResponse.json({ error: 'bad_image', message: '画像ファイルを選んでください' }, { status: 400, headers: noStore });
  }
  if (url.length > MAX_LEN) {
    return NextResponse.json({ error: 'too_large', message: '画像が大きすぎます。もう一度お試しください' }, { status: 413, headers: noStore });
  }
  const photo = await db.addRoundPhoto(params.id, meId, url);
  return NextResponse.json({ photo }, { headers: noStore });
}
