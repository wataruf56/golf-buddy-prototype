import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import { isAdminUserId } from '@/lib/adminAccess';
import { levelConditionLabel } from '@/lib/roundEligibility';
import type { Round } from '@/lib/types';

export async function GET() {
  const rounds = await db.listRounds({ status: 'open' });
  return NextResponse.json({ rounds });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const body = await req.json();
  const cohort = getCohort(me?.age) || undefined;
  const beginnerOnly = !!body.beginnerOnly;

  // 性別ごとの募集内訳。指定があればそれを正とし、maxSpots（＝主催者1＋募集枠）を再計算する。
  // 旧クライアント（内訳なし）は maxSpots をそのまま使い、全枠を「どちらでもOK」とみなす。
  const clampN = (v: any) => Math.max(0, Math.min(49, Math.floor(Number(v) || 0)));
  // 他アプリ等で既に集まっている人数（主催者と同様、最初から埋まっている扱い）
  const externalCount = clampN(body.externalCount);
  const hasBreakdown = ['spotsMale', 'spotsFemale', 'spotsAny'].some((k) => k in body);
  let spotsMale = clampN(body.spotsMale);
  let spotsFemale = clampN(body.spotsFemale);
  let spotsAny = clampN(body.spotsAny);
  let maxSpots: number;
  if (hasBreakdown) {
    let slots = spotsMale + spotsFemale + spotsAny;
    if (slots < 1) { spotsAny = 1; slots = 1; } // 最低1枠
    maxSpots = Math.min(50, 1 + externalCount + slots); // 主催者 + アプリ外 + 募集枠
  } else {
    maxSpots = Math.max(2, Math.min(50, Number(body.maxSpots) || 2));
    spotsMale = 0; spotsFemale = 0; spotsAny = Math.max(0, maxSpots - 1 - externalCount);
  }
  // 後方互換の性別条件をサーバー側で内訳から導出（単一性別のみ厳格ゲート）
  const genderCondition: 'any' | 'male' | 'female' =
    spotsAny === 0 && spotsFemale === 0 && spotsMale > 0 ? 'male'
    : spotsAny === 0 && spotsMale === 0 && spotsFemale > 0 ? 'female'
    : 'any';
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
    maxSpots,
    spotsMale,
    spotsFemale,
    spotsAny,
    externalCount,
    currentCount: 1 + externalCount, // 主催者 + アプリ外メンバーは最初から参加扱い
    applicantIds: [],
    price: body.price,
    beginnerOnly,
    genderCondition,
    // Derive the display label from the structured fields so older list/card
    // UIs that only read levelCondition still show the right thing.
    levelCondition: levelConditionLabel({ beginnerOnly, genderCondition, levelCondition: '' }),
    description: body.description,
    status: 'open',
    isCompetition: maxSpots >= 5,
    // "ゴルトモ公式" は管理者（福田渉）のみが選択可能。クライアントの申告は
    // 信用せず、サーバー側で管理者であることを再検証してから true にする。
    isOfficial: !!body.asOfficial && isAdminUserId(meId),
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
