import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import type { RoundGroup, RoundGuest } from '@/lib/types';
import { registeredParticipantIds, sameGroupPeerIds } from '@/lib/groups';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/rounds/[id]/groups { groups }
// Host-only. Saves the competition group assignment (組分け + スタート時間).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
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
  const seen = new Set<string>();
  const groups: RoundGroup[] = raw.slice(0, 50).map((g: any, i: number) => {
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

  await db.updateRound(params.id, { groups, guests, noShowIds } as any);

  // 完了済みコンペで組を直した場合、「変わった組」のメンバーだけレビューをやり直す。
  // = 同組の相手が変わった人について、そのラウンドの提出済み・未提出レビューをリセットし、
  //   新しい同組ペアで pending を作り直す。again（マッチ）はそのまま残す（本人の意思のため）。
  try {
    const adb = getAdminDb() as any;
    if (adb && round.status === 'completed' && round.isCompetition) {
      const newRound = { ...round, groups, noShowIds } as any;
      const peersOf = (r: any, m: string) => new Set(sameGroupPeerIds(r, m));
      const affected = registeredParticipantIds(round).filter((m) => {
        const a = peersOf(round, m); const b = peersOf(newRound, m);
        if (a.size !== b.size) return true;
        for (const x of a) if (!b.has(x)) return true;
        return false;
      });
      if (affected.length) {
        const aff = new Set(affected);
        const touches = (x: any) => aff.has(x?.reviewerId) || aff.has(x?.revieweeId);
        // 対象メンバーに関わる提出済みレビュー・未提出pendingを削除。
        for (const coll of ['reviews', 'pendingReviews']) {
          try {
            const snap = await adb.collection(coll).where('roundId', '==', params.id).get();
            const dels: Promise<any>[] = [];
            snap.forEach((d: any) => { if (touches(d.data())) dels.push(d.ref.delete()); });
            await Promise.all(dels);
          } catch (e) { console.warn('[groups re-review] delete failed', coll, (e as Error).message); }
        }
        // 新しい同組ペアで pending を作り直す（対象メンバーが関わるぶんだけ）。
        const toCreate: any[] = [];
        for (const m of affected) {
          for (const p of peersOf(newRound, m)) {
            toCreate.push({ id: `p_${params.id}_${m}_${p}`, roundId: params.id, reviewerId: m, revieweeId: p, status: 'pending', createdAt: Date.now() });
          }
        }
        if (toCreate.length) await db.createPendingReviews(toCreate);
      }
    }
  } catch (e) {
    console.warn('[groups re-review] failed', (e as Error).message);
  }

  return NextResponse.json({ ok: true, groups, guests, noShowIds }, { headers: noStore });
}
