import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { guestInvitePath, verifyGuestInviteToken } from '@/lib/guestInvite';

// ゲスト招待リンク（2026-10-08）。lib/guestInvite 参照。
//   PUT  { guestId }          … 主催者：そのゲスト専用の招待リンク（liff.line.me）を返す
//   GET  ?g=&t=               … リンクを開いた人：招待の中身（募集・主催者・ゲスト名・送迎）と状態
//   POST { guestId, token }   … リンクを開いた人：そのゲストの枠を自分に置き換える（参加確定）
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let guestId = '';
  try { guestId = String((await req.json())?.guestId || ''); } catch { /* noop */ }
  const guest = (round.guests || []).find((g) => g.id === guestId);
  if (!guest) return NextResponse.json({ error: 'guest_not_found' }, { status: 404, headers: noStore });
  const { liffUrl } = await import('@/lib/linePush');
  const path = guestInvitePath(round.id, guest.id);
  const url = liffUrl(path) || `https://app.goltomo.com${path}`;
  return NextResponse.json({ url, guestName: guest.name || '' }, { headers: noStore });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  const u = new URL(req.url);
  const guestId = u.searchParams.get('g') || '';
  const token = u.searchParams.get('t') || '';
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ status: 'not_found' }, { headers: noStore });
  if (!verifyGuestInviteToken(round.id, guestId, token)) return NextResponse.json({ status: 'invalid' }, { headers: noStore });
  const host = await db.getUser(round.hostId).catch(() => null);
  const summary = {
    id: round.id, title: round.title, date: round.date || '', dateRange: (round as any).dateRange || '', startTime: round.startTime || '',
    courseName: round.courseName || '', area: round.area || '', price: round.price || '', eventType: round.eventType || 'golf',
    status: round.status, hostName: host?.displayName || '主催者',
  };
  const guest = (round.guests || []).find((g) => g.id === guestId);
  const isMember = !!meId && (round.hostId === meId || (round.applicantIds || []).includes(meId));
  if (!guest) {
    // もう置き換わった（本人がすでに入っている／別の人が使った）
    return NextResponse.json({ status: isMember ? 'joined' : 'used', round: summary }, { headers: noStore });
  }
  const pk = (round as any).participantPickups?.[guestId] || null;
  return NextResponse.json({
    status: isMember ? 'already_member' : 'ok',
    round: summary,
    guest: { id: guest.id, name: guest.name || '', gender: guest.gender || '' },
    pickup: pk ? { status: pk.status || '', stations: pk.stations || [] } : null,
  }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  let guestId = ''; let token = '';
  try { const b = await req.json(); guestId = String(b?.guestId || ''); token = String(b?.token || ''); } catch { /* noop */ }
  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found', message: '募集が見つかりません' }, { status: 404, headers: noStore });
  if (!verifyGuestInviteToken(existing.id, guestId, token)) return NextResponse.json({ error: 'invalid', message: 'このリンクは使えません。主催者に確認してください' }, { status: 403, headers: noStore });
  if (existing.hostId === meId) return NextResponse.json({ error: 'host', message: '主催者は自分のゲスト枠に入れません' }, { status: 400, headers: noStore });
  const guest = (existing.guests || []).find((g) => g.id === guestId);
  if (!guest) return NextResponse.json({ error: 'used', message: 'この招待はすでに使われています' }, { status: 409, headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ error: 'user_not_found' }, { status: 404, headers: noStore });
  if (!me.age || !me.gender) return NextResponse.json({ error: 'profile_required', message: '年齢と性別を入れてください' }, { status: 400, headers: noStore });
  if (existing.hostCohort) {
    const { getCohort } = await import('@/lib/ageGate');
    if (getCohort(me.age) !== existing.hostCohort) {
      return NextResponse.json({ error: 'cohort_mismatch', message: 'この募集とは別の年代のため参加できません。主催者に確認してください' }, { status: 403, headers: noStore });
    }
  }
  const round = await db.replaceGuestWithUser(existing.id, { userId: meId, guestId, gender: me.gender });
  if (existing.status === 'completed') {
    try {
      const { reReviewAfterChange, notifyNewReviewPairs } = await import('@/lib/reReview');
      const r = await reReviewAfterChange(existing.id, existing, round);
      await notifyNewReviewPairs(round, r.notify.filter((x) => x !== meId));
    } catch (e) { console.warn('[guest-invite] re-review failed (non-fatal)', (e as Error).message); }
  }
  try {
    const { audit, userActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({
      action: AUDIT_ACTION.groupJoin,
      ...(await userActor(meId)),
      targetKind: 'round', targetId: existing.id, targetName: existing.title,
      summary: `「${existing.title}」に入った（ゲスト「${guest.name || ''}」の招待リンクから）`,
      detail: { by: 'guestInvite', guestId },
    }, req);
  } catch { /* noop */ }
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: stripRoundForViewer(round, meId), guestName: guest.name || '' }, { headers: noStore });
}
