import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { composeIntro } from '@/lib/roomIntro';

// POST /api/rounds/[id]/room-intro … 行ける日の部屋に入るときの「ひとこと」（2026-10-12・lib/roomIntro）
//   { areas: string[], budget, car } … 本人の発言としてチャットに入れる（通知はふつうの発言と同じ）
//   { skip: true }                   … 送らない（もう聞かない）
// 1部屋1回だけ（round.roomIntroDone[本人] に時刻）。行ける日の部屋（availDate）の参加者だけ。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const round: any = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!round.availDate || !(round.applicantIds || []).includes(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  if ((round.roomIntroDone || {})[meId]) return NextResponse.json({ ok: true, already: true }, { headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const adb = getAdminDb() as any;
  const mark = async () => { if (adb) await adb.collection('rounds').doc(params.id).set({ roomIntroDone: { [meId]: Date.now() } }, { merge: true }); };
  if (body.skip) { await mark(); return NextResponse.json({ ok: true, skipped: true }, { headers: noStore }); }
  const me = await db.getUser(meId);
  const text = composeIntro(me?.displayName || 'メンバー', {
    areas: Array.isArray(body.areas) ? body.areas.map(String).slice(0, 5) : [],
    budget: String(body.budget || ''), car: String(body.car || ''),
  });
  await mark();
  const message = await db.addRoundMessage(params.id, meId, text);
  try {
    const { notifyRoundChat } = await import('@/lib/roundChatNotify');
    await notifyRoundChat(round, meId, me?.displayName || 'メンバー', text);
  } catch { /* noop */ }
  return NextResponse.json({ ok: true, message }, { headers: noStore });
}
