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
  const guests: RoundGuest[] = Array.isArray(body?.guests)
    ? body.guests
        .map((x: any) => ({
          id: (typeof x?.id === 'string' && x.id ? x.id : '').slice(0, 40),
          name: (typeof x?.name === 'string' ? x.name : '').trim().slice(0, 30),
        }))
        .filter((x: RoundGuest) => x.id.startsWith('gst_') && x.name)
        .slice(0, 60)
    : (round.guests || []);
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

  await db.updateRound(params.id, { groups, groupsBack, guests, noShowIds } as any);

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

  return NextResponse.json({ ok: true, groups, groupsBack, guests, noShowIds }, { headers: noStore });
}
