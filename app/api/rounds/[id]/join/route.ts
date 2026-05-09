import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
  const round = await db.joinRound(params.id, meId);
  // Notify host of new application.
  if (host && !(host as any).notifyOff) {
    const applicantName = me?.displayName || 'ゲスト';
    pushTo(existing.hostId, `🆕 ${applicantName} さんが「${existing.title}」に参加申請しました`, liffUrl(`/round/${params.id}`)).catch(() => {});
  }
  return NextResponse.json({ round });
}
