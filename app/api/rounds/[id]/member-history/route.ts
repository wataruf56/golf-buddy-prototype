import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { getAdminDb } from '@/lib/firebase';
import { registeredParticipantIds, isNoShow, groupsFront, groupsBack, isGuestId } from '@/lib/groups';
import { isOfficialCompe } from '@/lib/officialCompe';
import type { Round, RoundGroup, User } from '@/lib/types';

// GET /api/rounds/[id]/member-history … 主催者・共同管理者だけ（2026-10-21 本人指定）
// 組み分けの参考に、この募集の参加者ひとりずつについて
//   femalePast   … （男性だけ）今までのコンペ（前回まで）で、女性と同じ組になった回数。前半・後半それぞれ
//                  （後半の組を入れ替えていないコンペは、後半も前半と同じ組として数える）
//   officialPast … 今までにゴルトモ公式コンペに出た回数（0＝今回が初参加）
// を返す。今回のコンペで女性と同じ組かは、組み分け画面が今の組から数える。
// 数えるコンペ：コンペ（isCompetition）で組が決まっていて、完了したもの、または今回より前の日付のもの（中止は除く）。当日来られなかった回は数えない。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export type MemberHistory = { femalePast?: { front: number; back: number; comps: number }; officialPast: number };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const people = registeredParticipantIds(round);
  const members: Record<string, MemberHistory> = {};
  const adb = getAdminDb() as any;
  if (!adb || !people.length) return NextResponse.json({ members }, { headers: noStore });
  const peopleSet = new Set(people);
  const peopleUsers = await db.listUsers(people);
  const males = new Set(peopleUsers.filter((u) => u.gender === 'male').map((u) => u.id));

  const snap = await adb.collection('rounds').where('isCompetition', '==', true).limit(3000).get();
  const today = String(round.date || '');
  const past: Round[] = [];
  for (const d of snap.docs) {
    if (d.id === round.id) continue;
    const r = { id: d.id, ...d.data() } as Round;
    if ((r as any).availDate || (r as any).heldCancelledAt || r.eventType === 'drink') continue;
    const done = r.status === 'completed' || (!!r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !!today && r.date < today);
    if (!done) continue;
    if (!registeredParticipantIds(r).some((id) => peopleSet.has(id))) continue;
    past.push(r);
  }

  // 過去の組にいた人の性別（登録会員はプロフィール・ゲストは足したときの男女）
  const otherIds = new Set<string>();
  for (const r of past) for (const g of [...groupsFront(r), ...groupsBack(r)]) for (const id of g.memberIds || []) if (!isGuestId(id)) otherIds.add(id);
  const genderOf = new Map<string, string | undefined>();
  for (const u of await db.listUsers(Array.from(otherIds)) as User[]) genderOf.set(u.id, u.gender);
  const femaleIn = (r: Round, g: RoundGroup | undefined, self: string) => !!g && (g.memberIds || []).some((id) => {
    if (id === self || isNoShow(r, id)) return false;
    if (isGuestId(id)) return (r.guests || []).find((x) => x.id === id)?.gender === 'female';
    return genderOf.get(id) === 'female';
  });

  for (const id of people) {
    const h: MemberHistory = { officialPast: 0 };
    if (males.has(id)) h.femalePast = { front: 0, back: 0, comps: 0 };
    for (const r of past) {
      if (!registeredParticipantIds(r).includes(id) || isNoShow(r, id)) continue;
      if (isOfficialCompe(r)) h.officialPast++;
      if (!h.femalePast) continue;
      const front = groupsFront(r).find((g) => (g.memberIds || []).includes(id));
      if (!front) continue;   // 組が決まっていない・組に入っていないコンペは数えない
      const back = groupsBack(r).length ? groupsBack(r).find((g) => (g.memberIds || []).includes(id)) : front;
      h.femalePast.comps++;
      if (femaleIn(r, front, id)) h.femalePast.front++;
      if (femaleIn(r, back, id)) h.femalePast.back++;
    }
    members[id] = h;
  }
  return NextResponse.json({ members, thisOfficial: isOfficialCompe(round) }, { headers: noStore });
}
