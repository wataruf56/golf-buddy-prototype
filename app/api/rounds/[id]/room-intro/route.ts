import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { composeIntro } from '@/lib/roomIntro';

// POST /api/rounds/[id]/room-intro … 行ける日の部屋に入るときの「ひとこと」（2026-10-12・lib/roomIntro）
//   { areas: string[], budget, car, variant } … 本人の発言としてチャットに入れる（通知はふつうの発言と同じ）
//   （{ skip: true } は 2026-10-15 から受け付けない。3つとも選んであいさつする＋いまいる人を全員メンション）
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
  // 2026-10-15〜「あいさつしないで入る」は無し（本人判断）。方面・予算・車の3つとも選んで、あいさつしてから話す。
  if (body.skip) return NextResponse.json({ error: 'intro_required', message: '方面・予算・車を選んで、あいさつしてから入ってください' }, { status: 400, headers: noStore });
  const { INTRO_AREAS, INTRO_BUDGETS, INTRO_CARS } = await import('@/lib/roomIntro');
  const areas: string[] = (Array.isArray(body.areas) ? body.areas.map(String) : []).filter((a: string) => (INTRO_AREAS as readonly string[]).includes(a)).slice(0, 5);
  const budget = String(body.budget || '');
  const car = String(body.car || '');
  if (!areas.length || !INTRO_BUDGETS.some((b) => b.key === budget) || !INTRO_CARS.some((c) => c.key === car)) {
    return NextResponse.json({ error: 'intro_incomplete', message: '行きたい方面・予算・車を、3つとも選んでください' }, { status: 400, headers: noStore });
  }
  const me = await db.getUser(meId);
  const intro = composeIntro(me?.displayName || 'メンバー', { areas, budget, car }, Number(body.variant));   // 言い回しの番号（画面の見本と同じ文にする・範囲外はランダム）
  // いまこの部屋にいる人を全員、個人名でメンション（2026-10-15）。自分と運営（管理人）は除く。
  // メンションは名前で判定する（lib/roundChatNotify：本文に「@名前」があればその人にメンション通知）。
  const { ADMIN_MANAGER_ID } = await import('@/lib/adminManagerId');
  const otherIds = Array.from(new Set<string>([round.hostId, ...(round.coHostIds || []), ...(round.applicantIds || [])]))
    .filter((id) => id && id !== meId && id !== ADMIN_MANAGER_ID);
  const others = (await db.listUsers(otherIds)).filter((u) => u && u.displayName);
  const mentionLine = others.map((u) => `@${u.displayName}`).join(' ');
  const text = mentionLine ? `${mentionLine}\n${intro}` : intro;
  await mark();
  const message = await db.addRoundMessage(params.id, meId, text);
  try {
    const { notifyRoundChat } = await import('@/lib/roundChatNotify');
    await notifyRoundChat(round, meId, me?.displayName || 'メンバー', text);
  } catch { /* noop */ }
  return NextResponse.json({ ok: true, message }, { headers: noStore });
}
