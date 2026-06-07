import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import { checkRoundEligibility, canGenderJoin, genderFullMessage } from '@/lib/roundEligibility';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
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
