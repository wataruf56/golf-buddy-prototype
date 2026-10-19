import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { getCohort, isMatchingAllowedByAge, isMatchingAllowedUser, userCohort } from '@/lib/ageGate';
import type { EventAnswer, EventRsvp } from '@/lib/types';

// POST /api/rounds/[id]/rsvp { status: 'yes'|'maybe'|'no', dates?: {候補ID: 'ok'|'maybe'|'no'}, answers?: {質問ID: string[]|string} }
// イベント（lib/eventRound・eventKind あり）の出欠と回答（2026-10-14）。何度でも答え直せる。
//   yes   … 参加確定（承認なし・applicantIds に入る＝グループチャットにも入れる）。定員・締切を見る
//   maybe … 未定（参加者には入れない。参加していたら外す）
//   no    … 行けない（参加していたら外す。招待されていたら「行けない」として主催者に伝わる）
// 主催者・共同主催者（共同管理者）は出欠を選ばない（いつも参加）が、候補日の◯△✕と質問には答えられる（集計に入る・2026-10-15）。
// 非公開の招待は、招待された人だけ。
const noStore = { 'Cache-Control': 'no-store' };
const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });
  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  { const { privateRoundGuard } = await import('@/lib/roundAccessServer'); const g = privateRoundGuard(round, meId); if (g) return g; }
  const { isEventRound } = await import('@/lib/eventRound');
  if (!isEventRound(round)) return NextResponse.json({ error: 'not_event' }, { status: 400, headers: noStore });
  const asHost = isRoundHost(round, meId);
  if (round.status !== 'open') return NextResponse.json({ error: 'closed', message: 'このイベントは受付を終えています' }, { status: 409, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const status = (asHost ? 'yes' : ['yes', 'maybe', 'no'].includes(body.status) ? body.status : '') as EventRsvp;
  if (!status) return NextResponse.json({ error: 'bad_request', message: '出欠を選んでください' }, { status: 400, headers: noStore });

  const me = await db.getUser(meId);
  const wasIn = asHost || (round.applicantIds || []).includes(meId);
  if (status === 'yes' && !wasIn) {
    if (!isMatchingAllowedUser(me)) return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403, headers: noStore });
    if (!round.hostCohort || userCohort(me) !== round.hostCohort) return NextResponse.json({ error: 'cohort_mismatch', message: '別の年齢帯のイベントには参加できません' }, { status: 403, headers: noStore });
    const host = await db.getUser(round.hostId);
    if ((host?.blockedUserIds || []).includes(meId)) return NextResponse.json({ error: 'blocked_by_host' }, { status: 403, headers: noStore });
    if (round.eventDeadline && todayJst() > round.eventDeadline) return NextResponse.json({ error: 'deadline', message: '申込の締切を過ぎています' }, { status: 409, headers: noStore });
    const { currentCountOf } = await import('@/lib/hostCount');
    if (currentCountOf(round) >= (round.maxSpots || 99)) return NextResponse.json({ error: 'full', message: '定員に達しています' }, { status: 409, headers: noStore });
  }

  // 回答を整える（候補日・質問にあるものだけ）
  const dates: Record<string, 'ok' | 'maybe' | 'no'> = {};
  for (const o of round.eventDateOptions || []) {
    const v = body?.dates?.[o.id];
    if (v === 'ok' || v === 'maybe' || v === 'no') dates[o.id] = v;
  }
  const answers: Record<string, string[] | string> = {};
  for (const q of round.eventQuestions || []) {
    const v = body?.answers?.[q.id];
    if (q.kind === 'choice') {
      const arr = (Array.isArray(v) ? v : v != null ? [v] : []).map(String).filter((x: string) => (q.options || []).includes(x));
      const pick = q.multi ? Array.from(new Set(arr)) : arr.slice(0, 1);
      if (pick.length) answers[q.id] = pick;
      else if (q.required && status !== 'no' && !asHost) return NextResponse.json({ error: 'required', message: `「${q.text}」に答えてください` }, { status: 400, headers: noStore });
    } else {
      const t = String(v ?? '').trim().slice(0, 300);
      if (t) answers[q.id] = t;
      else if (q.required && status !== 'no' && !asHost) return NextResponse.json({ error: 'required', message: `「${q.text}」に答えてください` }, { status: 400, headers: noStore });
    }
  }
  const entry: EventAnswer = { status, at: Date.now(), ...(Object.keys(dates).length ? { dates } : {}), ...(Object.keys(answers).length ? { answers } : {}) };

  // 出欠の反映
  if (status === 'yes' && !wasIn) await db.acceptInvite(params.id, meId);   // 主催者は wasIn=true なので触らない          // 承認なしで参加確定（招待中なら招待は消える）
  if (status !== 'yes' && wasIn) await db.leaveRound(params.id, meId);
  if (status === 'no' && (round.invitedIds || []).includes(meId)) await db.declineInvite(params.id, meId);
  // 回答は丸ごと置き換える（merge だと前の回答の質問・候補が残るため、本人のキーごと書き直す）
  {
    const fresh = await db.getRound(params.id);
    const all = { ...((fresh as any)?.eventAnswers || {}), [meId]: entry };
    const { getAdminDb } = await import('@/lib/firebase');
    const adb = getAdminDb() as any;
    if (adb) await adb.collection('rounds').doc(params.id).update({ eventAnswers: all });
    else await db.updateRound(params.id, { eventAnswers: all } as any);
  }

  // 主催者へ：参加する／行けなくなった（未定・答え直しでは知らせない）
  const prev = (round.eventAnswers || {})[meId]?.status;
  if (!asHost && ((status === 'yes' && !wasIn) || (status === 'no' && prev !== 'no' && (wasIn || prev)))) {
    try {
      const name = me?.displayName || 'メンバー';
      const link = `/round/${params.id}`;
      const text = status === 'yes'
        ? `🎉 ${name}さんが「${round.title}」に参加します`
        : `🙇 ${name}さんは「${round.title}」に行けなくなりました`;
      const hostIds = [round.hostId, ...(round.coHostIds || [])];
      const { addNotificationMany } = await import('@/lib/notifications');
      addNotificationMany(hostIds, status === 'yes' ? 'applyReceived' : 'participantLeft', text, link).catch(() => {});
      const host = await db.getUser(round.hostId);
      const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
      if (isNotifyEnabled(host as any, status === 'yes' ? 'applyReceived' : 'participantLeft')) {
        const { pushTo, liffUrl } = await import('@/lib/linePush');
        pushTo(round.hostId, text, liffUrl(link), status === 'yes' ? 'joined' : 'left').catch(() => {});
      }
    } catch { /* 通知の失敗は回答を妨げない */ }
  }

  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
