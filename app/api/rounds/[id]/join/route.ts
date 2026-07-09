import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import { checkRoundEligibility, canGenderJoin, genderFullMessage } from '@/lib/roundEligibility';
import type { PickupStatus } from '@/lib/types';

const VALID_PICKUP_STATUS = new Set<PickupStatus>(['can', 'cannot', 'want', 'no_need']);

// 参加申込に同梱されたピックアップ回答を正規化する（pickup/route.ts と同じ規則）。
// 申込直後はまだ承認前で participantPickups を単独更新できない（メンバー判定に
// 引っかかる）ため、join と一緒にこの経路で保存する。
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
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const existing = await db.getRound(params.id);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // 部分制限：参加申込の全面禁止／特定主催者のラウンドへの申込禁止。
  try {
    const { getRestriction } = await import('@/lib/banAccess');
    const rst = await getRestriction(meId);
    if (rst.noApplyAll) {
      return NextResponse.json({ error: 'restricted', message: '参加申込の利用が制限されています。' }, { status: 403 });
    }
    if ((rst.applyBlockHostIds || []).includes(existing.hostId)) {
      return NextResponse.json({ error: 'restricted', message: 'この主催者のラウンドには参加申込できません。' }, { status: 403 });
    }
  } catch { /* 判定不能時は許可 */ }

  // Cohort isolation: applicant must be in the same age cohort as the host's round.
  const myCohort = getCohort(me?.age);
  if (!existing.hostCohort || !myCohort || existing.hostCohort !== myCohort) {
    return NextResponse.json({ error: 'cohort_mismatch', message: '別の年齢帯のラウンドには参加できません' }, { status: 403 });
  }

  const host = await db.getUser(existing.hostId);
  if ((host?.blockedUserIds || []).includes(meId)) {
    return NextResponse.json({ error: 'blocked_by_host' }, { status: 403 });
  }

  // Beginner-only + gender restriction enforcement. Pure function so the
  // UI can show the same explanation before the user even taps "申し込む".
  const elig = checkRoundEligibility(existing, me || undefined);
  if (!elig.ok) {
    return NextResponse.json({ error: elig.code, message: elig.message }, { status: 403 });
  }

  // 性別ごとの募集枠ガード：承認済み参加者（主催者を除く）の性別を集計し、
  // 申込者の性別の枠（＋どちらでも枠）に空きがあるかを確認する。
  {
    const approved = await Promise.all((existing.applicantIds || []).map((id) => db.getUser(id)));
    const approvedGenders = approved.map((u) => u?.gender);
    if (!canGenderJoin(existing, approvedGenders, me?.gender)) {
      return NextResponse.json({ error: 'gender_full', message: genderFullMessage(me?.gender) }, { status: 403 });
    }
  }

  const round = await db.joinRound(params.id, meId);

  // 参加申込と同時に送られてきたピックアップ回答を保存する（あれば）。updateRound は
  // void を返すので、クライアントに返す round にはローカルでマージする。
  try {
    let body: any = {};
    try { body = await req.json(); } catch {}
    const pickup = normalizePickup(body?.pickup);
    if (pickup) {
      const next = { ...(round.participantPickups || {}), [meId]: pickup };
      await db.updateRound(params.id, { participantPickups: next } as any);
      round.participantPickups = next;
    }
  } catch { /* ピックアップ保存の失敗は申込自体を妨げない */ }

  const applicantName = me?.displayName || 'ゲスト';
  const msg = `🆕 ${applicantName} さんが「${existing.title}」に参加申請しました`;
  // Always record in the host's in-app inbox (home screen), even if LINE is off.
  {
    const { addNotification } = await import('@/lib/notifications');
    addNotification(existing.hostId, 'applyReceived', msg, `/round/${params.id}`).catch(() => {});
  }
  // Notify host of new application — gated on their "applyReceived" pref.
  if (isNotifyEnabled(host as any, 'applyReceived')) {
    pushTo(existing.hostId, msg, liffUrl(`/round/${params.id}`)).catch(() => {});
    webPushText(existing.hostId, '参加申請が届きました', msg, `/round/${params.id}`, `round-${params.id}`).catch(() => {});
  }
  return NextResponse.json({ round });
}
