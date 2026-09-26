import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isRoundHost } from '@/lib/roundHost';
import { getMeId } from '@/lib/session';
import type { RoundGroup, RoundGuest } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/groups { groups }
// Host-only. Saves the competition group assignment (組分け + スタート時間).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ編集できます' }, { status: 403, headers: noStore });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const raw = body?.groups;
  if (!Array.isArray(raw)) return NextResponse.json({ error: 'groups must be an array' }, { status: 400, headers: noStore });

  // ゲスト（ゴルトモ未登録・名前のみ）を先に確定。組み分けに含められる。
  // 既存の round.guests も温存しつつ、リクエストの guests で置き換える。
  const prevGuests = round.guests || [];
  const prevGender = new Map(prevGuests.map((g) => [g.id, g.gender]));
  const guests: RoundGuest[] = Array.isArray(body?.guests)
    ? body.guests
        .map((x: any) => {
          const id = (typeof x?.id === 'string' && x.id ? x.id : '').slice(0, 40);
          const gender = x?.gender === 'male' || x?.gender === 'female' ? x.gender : prevGender.get(id);
          return {
            id,
            name: (typeof x?.name === 'string' ? x.name : '').trim().slice(0, 30),
            ...(gender ? { gender } : {}),
          } as RoundGuest;
        })
        .filter((x: RoundGuest) => x.id.startsWith('gst_') && x.name)
        .slice(0, 60)
    : prevGuests;

  // ゲストは種類を問わず**1席を占める**。ボードから足したゲストも知り合い枠に数える
  // （以前は未算入で、登録者に置き換えた瞬間に人数が+1されていた）。
  //   足した → 知り合い枠+1（性別で）・参加人数+1・募集枠+1
  //   消した → 知り合い枠-1・参加人数-1・募集枠-1
  const prevIds = new Set(prevGuests.map((g) => g.id));
  const nextIds = new Set(guests.map((g) => g.id));
  const addedGuests = guests.filter((g) => !prevIds.has(g.id));
  const removedGuests = prevGuests.filter((g) => !nextIds.has(g.id));
  if (addedGuests.some((g) => g.gender !== 'male' && g.gender !== 'female')) {
    return NextResponse.json({ error: 'guest_gender_required', message: '追加するゲストの性別を選んでください（知り合い枠を男女で数えるため）' }, { status: 400, headers: noStore });
  }
  const seatPatch: Record<string, unknown> = {};
  if (addedGuests.length || removedGuests.length) {
    let em = round.externalMale || 0, ef = round.externalFemale || 0;
    let cur = round.currentCount || 1, max = round.maxSpots || 1;
    for (const g of addedGuests) { if (g.gender === 'female') ef++; else em++; cur++; max++; }
    for (const g of removedGuests) {
      const gd = g.gender || (em >= ef ? 'male' : 'female');   // 性別が無い古いゲストは多いほうから引く
      if (gd === 'female' && ef > 0) ef--; else if (em > 0) em--; else if (ef > 0) ef--;
      cur = Math.max(1, cur - 1); max = Math.max(1, max - 1);
    }
    Object.assign(seatPatch, { externalMale: em, externalFemale: ef, currentCount: cur, maxSpots: Math.min(50, max) });
    // 消したゲストの痕跡（入金・配車・来れなかった人）も一緒に落とす
    const { scrubMemberFromRound } = await import('@/lib/roundMembership');
    // 組（groups/groupsBack）と来れなかった人はこの後リクエストの値で上書きするので、ここでは扱わない。
    let cur2: any = { ...round, guests };
    for (const g of removedGuests) {
      const { groups: _g, groupsBack: _b, noShowIds: _n, ...rest } = scrubMemberFromRound(cur2, g.id).arrays as any;
      Object.assign(seatPatch, rest);
      cur2 = { ...cur2, ...rest };
    }
  }
  const guestIds = new Set(guests.map((g) => g.id));

  // メンバーは「実参加者（主催者＋承認済み）」または「確定済みゲスト」のみ許可。
  const participants = new Set<string>([round.hostId, ...(round.applicantIds || [])]);
  const allowed = (id: string) => participants.has(id) || guestIds.has(id);
  // 前半と後半で同じ整形をする。1人が2つの組に入らないよう、組の並びごとに重複を落とす。
  const shape = (list: any[]): RoundGroup[] => {
    const seen = new Set<string>();
    return list.slice(0, 50).map((g: any, i: number) => {
      const memberIds = Array.isArray(g?.memberIds)
        ? g.memberIds.filter((id: any) => typeof id === 'string' && allowed(id) && !seen.has(id) && (seen.add(id), true)).slice(0, 12)
        : [];
      return {
        id: typeof g?.id === 'string' && g.id ? g.id.slice(0, 40) : `g_${i}`,
        startTime: typeof g?.startTime === 'string' ? g.startTime.slice(0, 10) : undefined,
        course: typeof g?.course === 'string' && g.course.trim() ? g.course.trim().slice(0, 30) : undefined,
        memberIds,
      };
    });
  };
  const groups: RoundGroup[] = shape(raw);
  // 後半の組（前半と入れ替える場合だけ）。空配列＝入れ替えなし（後半も前半と同じ）。
  // 後半に入れられるのは前半のどこかの組にいる人だけ（前半にいない人が後半だけ回ることはない）。
  const inFront = new Set(groups.flatMap((g) => g.memberIds));
  const groupsBack: RoundGroup[] = Array.isArray(body?.groupsBack)
    ? shape(body.groupsBack).map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => inFront.has(id)) }))
    : (round.groupsBack || []);

  // 当日来れなかった人（除外）。登録参加者のIDのみ許可（ゲストはレビュー対象外なので不要）。
  // 組に入っている人は no-show にしない（両方に入っていたら組を優先）。
  const groupedIds = new Set<string>();
  for (const g of groups) for (const m of g.memberIds) groupedIds.add(m);
  const noShowIds: string[] = Array.isArray(body?.noShowIds)
    ? Array.from(new Set(
        (body.noShowIds as any[])
          .filter((id): id is string => typeof id === 'string' && participants.has(id) && !groupedIds.has(id)),
      )).slice(0, 50)
    : (round.noShowIds || []);

  await db.updateRound(params.id, { ...seatPatch, groups, groupsBack, guests, noShowIds } as any);

  // 完了済みのラウンドで組を直した場合、**変わったペアだけ**レビューをやり直す（lib/reReview）。
  // 前半・後半の入れ替えで新しく同じ組になった人にも、ここでレビューが立つ。
  try {
    const after = { ...round, groups, groupsBack, noShowIds } as any;
    const { reReviewAfterChange, notifyNewReviewPairs } = await import('@/lib/reReview');
    const r = await reReviewAfterChange(params.id, round, after);
    await notifyNewReviewPairs(after, r.notify);
  } catch (e) {
    console.warn('[groups re-review] failed', (e as Error).message);
  }

  return NextResponse.json({ ok: true, ...seatPatch, groups, groupsBack, guests, noShowIds }, { headers: noStore });
}
