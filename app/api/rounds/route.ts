import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge, getCohort, isMatchingAllowedUser, userCohort } from '@/lib/ageGate';
import { sanitizeCancelPolicy } from '@/lib/cancelPolicy';
import { isAdminUserId } from '@/lib/adminAccess';
import { levelConditionLabel } from '@/lib/roundEligibility';
import { reconcileGuests } from '@/lib/roundGuests';
import type { Round } from '@/lib/types';

export async function GET() {
  const raw = await db.listRounds({ status: 'open' });
  // 「見に来た人」「組み分け希望」「招待した相手」は主催者限定。
  // 以前ここだけ viewerId に null を渡していて、**自分の組み分け希望や
  // 自分あての招待まで消えていた**（この一覧は store.rounds を丸ごと
  // 置き換えるので、ホームの「招待されています」が出なくなる）。本人を渡す。
  const meId = await getMeId();
  const { stripRoundForViewer } = await import('@/lib/roundView');
  // 非公開の招待は、主催者・参加者・招待された人にだけ（2026-10-14・lib/roundAccess）
  const { canViewRound } = await import('@/lib/roundAccess');
  // 年代ごとに分ける（2026-10-20・bootstrap と同じ）：自分の年代の募集と、自分が関わる募集だけ
  const { userViewCohort } = await import('@/lib/ageGate');
  const me = meId ? await db.getUser(meId) : null;
  const myView = userViewCohort(me as any);
  const mine = (r: any) => !!meId && (r.hostId === meId || (r.applicantIds || []).includes(meId) || (r.pendingApplicantIds || []).includes(meId)
    || (r.coHostIds || []).includes(meId) || (r.invitedIds || []).includes(meId));
  const rounds = raw.filter((r) => canViewRound(r, meId) && (mine(r) || (!!myView && ((r as any).hostCohort || 'a') === myView))).map((r) => stripRoundForViewer(r, meId));
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
  if (!isMatchingAllowedUser(me)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const body = await req.json();
  const cohort = userCohort(me) || undefined;
  const beginnerOnly = !!body.beginnerOnly;

  // 性別ごとの募集内訳。指定があればそれを正とし、maxSpots（＝主催者1＋募集枠）を再計算する。
  // 旧クライアント（内訳なし）は maxSpots をそのまま使い、全枠を「どちらでもOK」とみなす。
  const clampN = (v: any) => Math.max(0, Math.min(49, Math.floor(Number(v) || 0)));
  // ゴルトモ公式（管理者のみ）として立てる募集は、主催者（管理者）を参加人数に数えない（2026-10-12）。
  // 下の isOfficial と同じ条件。主催者の枠は 0 になる。lib/hostCount
  const isOfficialNew = !!body.asOfficial && isAdminUserId(meId);
  const hostSeatN = isOfficialNew ? 0 : 1;
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
  // イベント（ラウンド以外・2026-10-14・lib/eventRound）。eventKind があれば新しいイベント（出欠＋質問の集計つき）。
  const { isEventKind, sanitizeEventFields } = await import('@/lib/eventRound');
  const eventKind = isDrink && isEventKind(body.eventKind) ? body.eventKind : undefined;
  // イベントは定員を決められる（自分を含めた人数・空欄なら定員なし＝DRINK_CAP）
  const eventCap = eventKind && Number(body.maxSpots) >= 2 ? Math.min(200, Math.floor(Number(body.maxSpots))) : 0;
  let maxSpots: number;
  if (isDrink) {
    maxSpots = eventCap || DRINK_CAP;   // 定員なし相当
    spotsAny = maxSpots - 1;            // 残り全枠を「どちらでもOK」に（表示では出さない）
  } else if (hasBreakdown) {
    let slots = spotsMale + spotsFemale + spotsAny;
    if (slots < 1) { spotsAny = 1; slots = 1; } // 最低1枠
    maxSpots = Math.min(50, hostSeatN + externalTotal + slots); // 主催者 + 知り合い + 募集枠
  } else {
    maxSpots = Math.max(1 + hostSeatN, Math.min(50, Number(body.maxSpots) || 2));
    spotsMale = 0; spotsFemale = 0; spotsAny = Math.max(0, maxSpots - hostSeatN - externalTotal);
  }

  // 共同管理者（任意・複数可）。主催者と同じ権限を持ち、作成時から参加者(applicantIds)として
  // 扱う（参加申請不要）。実在ユーザーのみ・自分自身/重複は除外。
  const coHostIds: string[] = [];
  {
    const raw: string[] = Array.isArray(body.coHostIds)
      ? body.coHostIds.map((x: any) => String(x))
      : body.coHostId ? [String(body.coHostId)] : []; // 旧クライアント（単一）互換
    for (const id of raw) {
      if (!id || id === meId || coHostIds.includes(id)) continue;
      const cu = await db.getUser(id);
      if (cu) coHostIds.push(id);
      if (coHostIds.length >= 10) break; // 安全上限
    }
  }
  // 知り合い枠（external）の人数ぶん、名前つきゲスト（guests）のスロットを作る。名前は任意で、
  // 空欄なら「知り合い1」等の既定名。人数は external で数えているので二重計上はしない。
  const guestList = (() => {
    if (isDrink || externalTotal <= 0) return undefined;
    const raw: string[] = Array.isArray(body.guestNames) ? body.guestNames.map((x: any) => String(x ?? '')) : [];
    const names = Array.from({ length: externalTotal }, (_, i) => raw[i] || '');
    const g = reconcileGuests(undefined, names);
    return g.length ? g : undefined;
  })();

  // 共同管理者は承認済み参加者として1枠を占有する。定員に収まらない場合のみ総定員を広げる。
  const baseFixedCount = hostSeatN + externalTotal + coHostIds.length; // 主催者 + 知り合い + 共同管理者
  if (baseFixedCount > maxSpots) maxSpots = Math.min(isDrink ? Math.max(DRINK_CAP, maxSpots) : 50, baseFixedCount);
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
    venue: isDrink && body.venue ? String(body.venue).slice(0, eventKind ? 80 : 60) : undefined,
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
    currentCount: hostSeatN + externalTotal + coHostIds.length, // 主催者 + 知り合い + 共同管理者は最初から参加扱い
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
    // 主催者からのメッセージ（2026-10-12）。作成画面の入力欄はこちらに保存する
    ...(String(body.hostNote || '').trim() ? { hostNote: String(body.hostNote).trim().slice(0, 4000) } : {}),
    meetingInfo: body.meetingInfo ? String(body.meetingInfo).slice(0, 200) : undefined,
    pickupStations: isDrink ? undefined : (Array.isArray(body.pickupStations)
      ? body.pickupStations.map((x: any) => String(x).slice(0, 20)).slice(0, 20)
      : undefined),
    pickupCapacity: isDrink ? undefined : (typeof body.pickupCapacity === 'number' && body.pickupCapacity > 0
      ? Math.min(8, Math.floor(body.pickupCapacity)) : undefined),
    pickupOffered: isDrink ? false : (typeof body.pickupOffered === 'boolean' ? body.pickupOffered : undefined),
    status: 'open',
    // 組み分け・配車は主催者が「公開する」を押すまで参加者に見せない（2026-10-06）
    assignmentsPublished: false,
    carsPublished: false,
    // 知り合い枠（external）の人数ぶんの「名前つきゲスト」。募集人数タブで入力された名前。
    // 人数は externalMale/Female でカウント済みなので、ここでは名札を作るだけ。
    guests: guestList,
    // 入金管理（主催者が事前集金してまとめて払うケース）。ONのとき詳細に「💰 入金」タブが出る。
    paymentEnabled: !!body.paymentEnabled,
    // 金額・振込先・入金期日（2026-10-12）。入金管理ONのときだけ。整形は /api/rounds/[id]/payments と同じ
    ...(body.paymentEnabled && sanitizePaymentInfo(body.paymentInfo) ? { paymentInfo: sanitizePaymentInfo(body.paymentInfo)! } : {}),
    // キャンセル規定（任意・2026-10-10）
    ...(sanitizeCancelPolicy(body.cancelPolicy) ? { cancelPolicy: sanitizeCancelPolicy(body.cancelPolicy) } : {}),
    // 飲み会は定員なしのため大きな maxSpots になるが、コンペ扱いにはしない。
    isCompetition: !isDrink && maxSpots >= 5,
    // "ゴルトモ公式" は管理者（福田渉）のみが選択可能。クライアントの申告は
    // 信用せず、サーバー側で管理者であることを再検証してから true にする。
    isOfficial: isOfficialNew,
    // 公式募集は主催者を人数に数えない（2026-10-12）。既存の募集には付けない（数え方を変えない）。
    ...(isOfficialNew ? { hostNotCounted: true } : {}),
    createdAt: Date.now(),
    // 公開範囲（2026-10-14・lib/roundAccess）。'invite'＝招待した人だけ
    ...(body.visibility === 'invite' ? { visibility: 'invite' as const } : {}),
    ...(eventKind ? sanitizeEventFields(body) : {}),
    ...(eventKind ? { eventKind } : {}),
  };
  // イベントで「アプリで事前集金」を選んだら入金管理をON（ラウンドと同じ入金タブ・振込先・期日・催促）
  if (eventKind && (round.payMethods || []).includes('app')) {
    round.paymentEnabled = true;
    const pi = sanitizePaymentInfo(body.paymentInfo);
    if (pi) round.paymentInfo = pi;
  }
  // 候補日から決めるイベントは、いちばん早い候補を仮の日付にする（一覧の並び・表示用）
  if (round.eventDatePending && round.eventDateOptions?.length) {
    round.dateType = 'fixed';
    round.date = round.eventDateOptions[0].date;
    round.startTime = round.eventDateOptions[0].startTime || round.startTime;
  }
  try {
    const created = await db.createRound(round);
    if (created.visibility === 'invite') {
      // 非公開の招待：作るときに選んだ人へ招待状を送る（ゴル友・同じ組で回った人だけ・同じ年代だけ）。希望条件の通知はしない。
      const invited = await sendInitialInvites(created, meId, body.inviteIds);
      const fresh = (await db.getRound(created.id)) || created;
      return NextResponse.json({ round: fresh, invited });
    }
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

// 作成時の paymentInfo 整形（2026-10-12）。中身が空なら null（＝保存しない）
function sanitizePaymentInfo(raw: any): { amount?: number; account?: string; deadline?: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const amount = Math.max(0, Math.min(1_000_000, Math.floor(Number(raw.amount) || 0)));
  const account = String(raw.account || '').trim().slice(0, 300);
  const deadline = Math.floor(Number(raw.deadline) || 0);
  const out = {
    ...(amount ? { amount } : {}),
    ...(account ? { account } : {}),
    ...(deadline > 1_600_000_000_000 ? { deadline } : {}),
  };
  return Object.keys(out).length ? out : null;
}

// 非公開の招待の最初の招待状（2026-10-14）。招待できるのは ゴル友（友達リスト）か、同じ組で回ったことがある人。
// 運営（管理者）は誰でも招待できる。年代（20〜30代／40〜50代）が違う人には送らない。最大50人。
async function sendInitialInvites(round: Round, meId: string, raw: any): Promise<number> {
  const ids: string[] = Array.from(new Set<string>((Array.isArray(raw) ? raw : []).map(String).filter((x: string) => x && x !== meId))).slice(0, 50);
  if (!ids.length) return 0;
  let allowed: Set<string> | null = null;
  if (!isAdminUserId(meId)) {
    const { friendSetOf } = await import('@/lib/friendSet');
    const { sameGroupPartnerIds } = await import('@/lib/pastPartners');
    const [f, p] = await Promise.all([friendSetOf(meId), sameGroupPartnerIds(meId).catch(() => new Set<string>())]);
    allowed = new Set<string>([...Array.from(f), ...Array.from(p as Set<string>)]);
  }
  const { sendRoundInvite } = await import('@/lib/roundInvite');
  let n = 0;
  let cur: Round = round;
  for (const id of ids) {
    if (allowed && !allowed.has(id)) continue;
    if ((round.applicantIds || []).includes(id)) continue;   // 共同管理者などすでに参加している人
    const u = await db.getUser(id);
    if (!u || userCohort(u) !== round.hostCohort) continue;
    try {
      const r = await sendRoundInvite({ round: cur, inviteeId: id, by: 'host' });
      cur = r.round;
      if (r.added) n++;
    } catch (e) { console.error('[rounds POST] invite failed', id, (e as Error).message); }
  }
  return n;
}
