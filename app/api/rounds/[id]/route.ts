import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { levelConditionLabel } from '@/lib/roundEligibility';
import type { Round } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// Returns a single round plus the participant users (host + approved/pending
// applicants) so the round-detail page can render even when the caller's
// store-side bootstrap filtered this round out (e.g. a friend who arrived
// via a shared link before completing profile registration — bootstrap's
// cohort filter would otherwise leave their store.rounds empty).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // isOfficial is an explicit stored flag now (admin-toggled), passed as-is.
  const userIds = new Set<string>([round.hostId]);
  for (const a of round.applicantIds || []) userIds.add(a);
  for (const a of round.pendingApplicantIds || []) userIds.add(a);
  for (const a of round.interestedIds || []) userIds.add(a);
  for (const a of round.invitedIds || []) userIds.add(a);
  const users = await db.listUsers(Array.from(userIds));
  // Strip private real names — the round host gets participant names via the
  // dedicated /api/rounds/[id]/participant-names endpoint instead.
  const { stripPrivateMany } = await import('@/lib/sanitizeUser');
  return NextResponse.json({ round, users: stripPrivateMany(users, null) });
}

// PATCH /api/rounds/[id] — host-only full edit of the round post. Accepts any
// subset of editable fields (level / 日時 / 費用 / 人数 / コース etc.). Fields
// can legitimately change after posting, so all are editable until completion.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ編集できます' }, { status: 403, headers: noStore });
  }
  if (round.status === 'completed') {
    return NextResponse.json({ error: 'completed', message: '完了した募集は編集できません' }, { status: 400, headers: noStore });
  }

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}

  const patch: Partial<Round> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('title')) patch.title = String(body.title || '').slice(0, 60) || round.title;
  if (has('courseName')) patch.courseName = body.courseName ? String(body.courseName).slice(0, 80) : '';
  if (has('area')) patch.area = body.area ? String(body.area) : '';
  if (has('dateType')) patch.dateType = body.dateType === 'range' ? 'range' : 'fixed';
  if (has('date')) patch.date = body.date ? String(body.date) : '';
  if (has('dateRange')) patch.dateRange = body.dateRange ? String(body.dateRange).slice(0, 80) : '';
  if (has('startTime')) patch.startTime = body.startTime ? String(body.startTime) : '';
  if (has('price')) patch.price = body.price ? String(body.price).slice(0, 40) : '';
  if (has('description')) patch.description = body.description ? String(body.description).slice(0, 200) : '';
  if (has('pickupStations')) patch.pickupStations = Array.isArray(body.pickupStations)
    ? body.pickupStations.map((x: any) => String(x).slice(0, 20)).slice(0, 20)
    : [];
  if (has('pickupCapacity')) patch.pickupCapacity = typeof body.pickupCapacity === 'number' && body.pickupCapacity > 0
    ? Math.min(8, Math.floor(body.pickupCapacity)) : undefined;

  let beginnerOnly = round.beginnerOnly;
  let genderCondition = round.genderCondition || 'any';
  if (has('beginnerOnly')) { beginnerOnly = !!body.beginnerOnly; patch.beginnerOnly = beginnerOnly; }

  const hasBreakdown = ['spotsMale', 'spotsFemale', 'spotsAny'].some((k) => has(k));
  if (hasBreakdown) {
    // 性別内訳を正として maxSpots・genderCondition・currentCount を再計算。
    const clampN = (v: any, fb = 0) => Math.max(0, Math.min(49, Math.floor(Number(v ?? fb) || 0)));
    const sm = clampN(body.spotsMale, round.spotsMale);
    const sf = clampN(body.spotsFemale, round.spotsFemale);
    let sa = clampN(body.spotsAny, round.spotsAny);
    let slots = sm + sf + sa;
    if (slots < 1) { sa = 1; slots = 1; }
    // 主催者の知り合い（ゴルトモ外で集まっている人）。主催者と同様に枠を埋める扱い。
    const em = has('externalMale') ? clampN(body.externalMale, round.externalMale) : (round.externalMale || 0);
    const ef = has('externalFemale') ? clampN(body.externalFemale, round.externalFemale) : (round.externalFemale || 0);
    const external = em + ef;
    const approvedApp = round.applicantIds?.length || 0;
    if (slots < approvedApp) {
      return NextResponse.json(
        { error: 'too_small', message: `すでに${approvedApp}人がゴルトモから参加しているため、募集枠をそれ未満にはできません` },
        { status: 400, headers: noStore },
      );
    }
    const nextMax = Math.min(50, 1 + external + slots);
    patch.spotsMale = sm; patch.spotsFemale = sf; patch.spotsAny = sa;
    patch.externalMale = em; patch.externalFemale = ef;
    patch.currentCount = 1 + external + approvedApp; // 主催者 + 知り合い + 承認済み
    patch.maxSpots = nextMax; patch.isCompetition = nextMax >= 5;
    genderCondition = sa === 0 && sf === 0 && sm > 0 ? 'male'
      : sa === 0 && sm === 0 && sf > 0 ? 'female' : 'any';
    patch.genderCondition = genderCondition;
  } else {
    if (has('genderCondition')) {
      genderCondition = body.genderCondition === 'male' || body.genderCondition === 'female' ? body.genderCondition : 'any';
      patch.genderCondition = genderCondition;
    }
    if (has('maxSpots')) {
      const next = Math.max(1, Math.min(50, Number(body.maxSpots) || round.maxSpots));
      // Can't shrink below the number of people already in (host + approved).
      if (next < (round.currentCount || 1)) {
        return NextResponse.json(
          { error: 'too_small', message: `すでに${round.currentCount}人が参加しているため、それ未満にはできません` },
          { status: 400, headers: noStore },
        );
      }
      patch.maxSpots = next;
      patch.isCompetition = next >= 5;
    }
  }
  if (has('beginnerOnly') || hasBreakdown || has('genderCondition')) {
    patch.levelCondition = levelConditionLabel({ beginnerOnly, genderCondition, levelCondition: '' });
  }

  try {
    await db.updateRound(params.id, patch);
    const updated = await db.getRound(params.id);
    return NextResponse.json({ round: updated }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/rounds/[id] PATCH] failed', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}

// DELETE /api/rounds/[id] — host-only deletion of the post (and its chat).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ ok: true }, { headers: noStore }); // already gone
  if (round.hostId !== meId) {
    return NextResponse.json({ error: 'forbidden', message: '主催者のみ削除できます' }, { status: 403, headers: noStore });
  }

  try {
    await db.deleteRound(params.id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/rounds/[id] DELETE] failed', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
