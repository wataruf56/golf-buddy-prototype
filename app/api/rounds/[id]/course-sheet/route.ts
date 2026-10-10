import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { getAdminDb } from '@/lib/firebase';

// POST /api/rounds/[id]/course-sheet  { dataUrl }  主催者だけ（2026-10-10）
// ゴルフ場に送る組分けの画像（A4・PNG）を一時的に預かり、推測できないURLを返す。
// LINE の中のブラウザでは画像のダウンロードができないため、外部ブラウザ（Safari 等）で
// このURLを開いて「写真に保存」「プリント」できるようにする。24時間で見られなくなる。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let dataUrl = '';
  try { dataUrl = String((await req.json())?.dataUrl || ''); } catch { /* noop */ }
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return NextResponse.json({ error: 'bad_image' }, { status: 400, headers: noStore });
  if (m[2].length > 950_000) return NextResponse.json({ error: 'too_large' }, { status: 413, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const token = crypto.randomBytes(18).toString('base64url');
  await adb.collection('_courseSheets').doc(token).set({ roundId: round.id, hostId: meId, type: m[1], b64: m[2], createdAt: Date.now() });
  return NextResponse.json({ url: `https://app.goltomo.com/api/course-sheet/${token}` }, { headers: noStore });
}
