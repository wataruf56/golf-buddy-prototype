import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import type { PickupStatus } from '@/lib/types';

// POST /api/rounds/[id]/accept-invite  body: { pickup? }
// 招待された本人が「参加する」を押したとき、承認待ちを経由せず即参加確定にする。
// 主催者が明示的に招待した相手なので、性別枠・初心者条件のゲートはかけない
// （年齢帯コホート・BAN・満員（枠）だけは尊重する）。
const noStore = { 'Cache-Control': 'no-store' };
const VALID_PICKUP_STATUS = new Set<PickupStatus>(['can', 'cannot', 'want', 'no_need']);

function normalizePickup(raw: any): { status?: PickupStatus; stations: string[]; capacity?: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const status: PickupStatus | undefined = VALID_PICKUP_STATUS.has(raw.status) ? raw.status : undefined;
  if (!status) return null;
  const stations = (status === 'can' || status === 'want') && Array.isArray(raw.stations)
    ? raw.stations.map((x: any) => String(x).slice(0, 20)).filter(Boolean).slice(0, 20)
    : [];
  const capacity = status === 'can' && typeof raw.capacity === 'number' && raw.capacity > 0
    ? Math.min(8, Math.floor(raw.capacity)) : undefined;
  return { status, stations, ...(capacity ? { capacity } : {}) };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403, headers: noStore });
  }

  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });

  // 招待されている本人だけがこの経路を使える。
  if (!(existing.invitedIds || []).includes(meId)) {
    return NextResponse.json({ error: 'not_invited', message: 'このラウンドに招待されていません' }, { status: 403, headers: noStore });
  }
  // 既に参加確定ならそのまま成功扱い。
  if ((existing.applicantIds || []).includes(meId)) {
    return NextResponse.json({ round: existing }, { headers: noStore });
  }

  // 年齢帯（コホート）は尊重する。
  const myCohort = getCohort(me?.age);
  if (existing.hostCohort && (!myCohort || existing.hostCohort !== myCohort)) {
    return NextResponse.json({ error: 'cohort_mismatch', message: '別の年齢帯のラウンドには参加できません' }, { status: 403, headers: noStore });
  }
  // 満員（枠）は尊重する。
  if ((existing.currentCount || 0) >= existing.maxSpots) {
    return NextResponse.json({ error: 'full', message: '満員のため参加できません' }, { status: 403, headers: noStore });
  }

  const round = await db.acceptInvite(params.id, meId);

  // 招待承認と同時に送られてきたピックアップ回答を保存する（あれば）。
  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const pickup = normalizePickup(body?.pickup);
    if (pickup) {
      const next = { ...(round.participantPickups || {}), [meId]: pickup };
      await db.updateRound(params.id, { participantPickups: next } as any);
      round.participantPickups = next;
    }
  } catch { /* ピックアップ保存の失敗は参加自体を妨げない */ }

  // 主催者へ「招待から参加しました」を通知（承認待ちではなく確定）。
  const name = me?.displayName || 'ゲスト';
  const link = `/round/${params.id}`;
  const host = await db.getUser(existing.hostId);
  const inApp = `✅ ${name}さんが招待を承認して参加しました（「${existing.title}」）`;
  try {
    const { addNotification } = await import('@/lib/notifications');
    addNotification(existing.hostId, 'applyReceived', inApp, link).catch(() => {});
  } catch { /* noop */ }
  if (isNotifyEnabled(host as any, 'applyReceived')) {
    pushTo(existing.hostId, inApp, liffUrl(link)).catch(() => {});
    webPushText(existing.hostId, '招待から参加', `${name}さんが参加しました`, link, `round-${params.id}`).catch(() => {});
  }

  return NextResponse.json({ round }, { headers: noStore });
}
