import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';

// POST /api/rounds/[id]/chat/seen { at } … グループチャットをここまで見た（2026-10-12）。
// 「💬 新着」を端末をまたいで消すため users.roundChatSeen[募集] に時刻を残す（新しい時刻のときだけ書く）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId && !(round.applicantIds || []).includes(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const at = Math.min(Date.now(), Number(body.at) || Date.now());
  const adb = getAdminDb() as any;
  if (adb) await adb.collection('users').doc(meId).set({ roundChatSeen: { [params.id]: at } }, { merge: true });
  return NextResponse.json({ ok: true, at }, { headers: noStore });
}
