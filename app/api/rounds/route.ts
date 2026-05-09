import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import type { Round } from '@/lib/types';

export async function GET() {
  const rounds = await db.listRounds({ status: 'open' });
  return NextResponse.json({ rounds });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const body = await req.json();
  const cohort = getCohort(me?.age) || undefined;
  const round: Omit<Round, 'id'> = {
    hostId: meId,
    hostCohort: cohort,
    title: body.title,
    type: body.type,
    courseName: body.courseName,
    area: body.area,
    dateType: body.dateType,
    date: body.date,
    dateRange: body.dateRange,
    startTime: body.startTime,
    maxSpots: Math.max(1, Math.min(50, Number(body.maxSpots) || 1)),
    currentCount: 1,
    applicantIds: [],
    price: body.price,
    levelCondition: body.levelCondition || 'スコア不問',
    description: body.description,
    status: 'open',
    isCompetition: (Number(body.maxSpots) || 1) >= 5,
    createdAt: Date.now(),
  };
  try {
    const created = await db.createRound(round);
    return NextResponse.json({ round: created });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/rounds POST] failed', msg, round);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
