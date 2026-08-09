import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge, getCohort } from '@/lib/ageGate';
import { isAdminUserId } from '@/lib/adminAccess';
import { levelConditionLabel } from '@/lib/roundEligibility';
import type { Round } from '@/lib/types';

export async function GET() {
  const raw = await db.listRounds({ status: 'open' });
  // 「見に来た人」(viewedBy) と組み分け希望(groupPrefs) は主催者限定。汎用一覧では必ず落とす。
  const { stripViews, stripGroupPrefsForViewer } = await import('@/lib/roundView');
  const rounds = raw.map((r) => stripViews(stripGroupPrefsForViewer(r, null)));
  return NextResponse.json({ rounds });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  // 部分制限：ラウンド募集の停止。
  try {
    const { getRestriction } = await import('@/lib/banAccess');
    if ((await getRestriction(meId)).noCreate) {
      return NextResponse.json({ error: 'restricted', message: 'ラウンド募集の利用が制限されています。' }, { status: 403 });
    }
  } catch { /* 判定不能時は許可 */ }
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
  // イベント種別。'drink' の場合はゴルフ場/組み分け/送迎/レビューを持たない飲み会募集。
  const eventType: 'golf' | 'drink' = body.eventType === 'drink' ? 'drink' : 'golf';
  const isDrink = eventType === 'drink';
  // 飲み会は「募集人数を決めない（定員なし・誰でも参加OK）」。実装上は十分大きな上限を
  // 置いて満員にならないようにし、男女内訳・知り合い枠は持たない。
  const DRINK_CAP = 99;
  // 主催者の知り合い（ゴルトモ外で既に集まっている人）。主催者と同様、最初から埋まっている扱い。
  const externalMale = isDrink ? 0 : clampN(body.externalMale);
  const externalFemale = isDrink ? 0 : clampN(body.externalFemale);
  const externalTotal = externalMale + externalFemale + (!isDrink && body.externalMale == null && body.externalFemale == null ? clampN(body.externalCount) : 0);
  const hasBreakdown = !isDrink && ['spotsMale', 'spotsFemale', 'spotsAny'].some((k) => k in body);
  let spotsMale = isDrink ? 0 : clampN(body.spotsMale);
  let spotsFemale = isDrink ? 0 : clampN(body.spotsFemale);
  let spotsAny = isDrink ? 0 : clampN(body.spotsAny);
  let maxSpots: number;
  if (isDrink) {
    maxSpots = DRINK_CAP;               // 定員なし相当
    spotsAny = DRINK_CAP - 1;           // 残り全枠を「どちらでもOK」に（表示では出さない）
  } else if (hasBreakdown) {
    let slots = spotsMale + spotsFemale + spotsAny;
    if (slots < 1) { spotsAny = 1; slots = 1; } // 最低1枠
    maxSpots = Math.min(50, 1 + externalTotal + slots); // 主催者 + 知り合い + 募集枠
  } else {
    maxSpots = Math.max(2, Math.min(50, Number(body.maxSpots) || 2));
    spotsMale = 0; spotsFemale = 0; spotsAny = Math.max(0, maxSpots - 1 - externalTotal);
  }

  // 共同管理者（任意・現状1名）。主催者と同じ権限を持ち、作成時から参加者(applicantIds)として
  // 扱う（参加申請不要）。実在ユーザーのみ・自分自身は除外。
  const coHostIds: string[] = [];
  {
    const rawCo = body.coHostId ? String(body.coHostId) : '';
    if (rawCo && rawCo !== meId) {
      const cu = await db.getUser(rawCo);
      if (cu) coHostIds.push(rawCo);
    }
  }
  // 共同管理者は主催者同様「最初から埋まっている固定メンバー」。募集枠(spotsAny等)は変えず総定員だけ広げる。
  if (coHostIds.length) maxSpots = Math.min(isDrink ? DRINK_CAP : 50, maxSpots + coHostIds.length);
  // 後方互換の性別条件をサーバー側で内訳から導出（単一性別のみ厳格ゲート）。飲み会は常に 'any'。
  const genderCondition: 'any' | 'male' | 'female' = isDrink ? 'any'
    : spotsAny === 0 && spotsFemale === 0 && spotsMale > 0 ? 'male'
    : spotsAny === 0 && spotsMale === 0 && spotsFemale > 0 ? 'female'
    : 'any';
  const round: Omit<Round, 'id'> = {
    hostId: meId,
    coHostIds: coHostIds.length ? coHostIds : undefined,
    hostCohort: cohort,
    title: body.title,
    eventType,
    // 飲み会はコース確定/未定の概念がないので、内部的には 'confirmed'（日付固定）として扱う。
    type: isDrink ? 'confirmed' : body.type,
    courseName: isDrink ? undefined : body.courseName,
    venue: isDrink && body.venue ? String(body.venue).slice(0, 60) : undefined,
    // 飲み会はエリアを入力しない。
    area: isDrink ? undefined : body.area,
    dateType: body.dateType,
    date: body.date,
    dateRange: body.dateRange,
    startTime: body.startTime,
    maxSpots,
    spotsMale,
    spotsFemale,
    spotsAny,
    externalMale,
    externalFemale,
    currentCount: 1 + externalTotal + coHostIds.length, // 主催者 + 知り合い + 共同管理者は最初から参加扱い
    applicantIds: [...coHostIds], // 共同管理者は承認済み参加者として初期登録（申請不要）

    price: body.price ? String(body.price).slice(0, 40) : undefined,
    // 男女別料金（両方あるときだけ有効）。
    priceMale: body.priceMale ? String(body.priceMale).slice(0, 40) : undefined,
    priceFemale: body.priceFemale ? String(body.priceFemale).slice(0, 40) : undefined,
    beginnerOnly: isDrink ? false : beginnerOnly,
    genderCondition,
    // Derive the display label from the structured fields so older list/card
    // UIs that only read levelCondition still show the right thing.
    levelCondition: levelConditionLabel({ beginnerOnly, genderCondition, levelCondition: '' }),
    description: body.description,
    meetingInfo: body.meetingInfo ? String(body.meetingInfo).slice(0, 200) : undefined,
    pickupStations: isDrink ? undefined : (Array.isArray(body.pickupStations)
      ? body.pickupStations.map((x: any) => String(x).slice(0, 20)).slice(0, 20)
      : undefined),
    pickupCapacity: isDrink ? undefined : (typeof body.pickupCapacity === 'number' && body.pickupCapacity > 0
      ? Math.min(8, Math.floor(body.pickupCapacity)) : undefined),
    pickupOffered: isDrink ? false : (typeof body.pickupOffered === 'boolean' ? body.pickupOffered : undefined),
    status: 'open',
    // 飲み会は定員なしのため大きな maxSpots になるが、コンペ扱いにはしない。
    isCompetition: !isDrink && maxSpots >= 5,
    // "ゴルトモ公式" は管理者（福田渉）のみが選択可能。クライアントの申告は
    // 信用せず、サーバー側で管理者であることを再検証してから true にする。
    isOfficial: !!body.asOfficial && isAdminUserId(meId),
    createdAt: Date.now(),
  };
  try {
    const created = await db.createRound(round);
    // アンケート（LP診断シグナル）で希望エリアにこの県を登録した人へ、
    // 「条件に一致する募集が投稿されました」と通知（best-effort・投稿は止めない）。
    import('@/lib/surveyMatch').then((m) => m.notifyMatchingSignals(created)).catch(() => {});
    return NextResponse.json({ round: created });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/rounds POST] failed', msg, round);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
