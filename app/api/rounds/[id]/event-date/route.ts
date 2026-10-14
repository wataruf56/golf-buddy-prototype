import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';

// POST /api/rounds/[id]/event-date { optionId } … 候補日から決めるイベントの日程を、主催者が1つに決める（2026-10-14）。
// ◯がいちばん多い日でなくても、どの候補でも選べる。決めると date/startTime を書き換え、
// 参加者と「未定」の人にお知らせ（＋LINE：開催前リマインドの設定がONの人）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden', message: '主催者だけが決められます' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const opt = (round.eventDateOptions || []).find((o) => o.id === String(body.optionId || ''));
  if (!opt) return NextResponse.json({ error: 'bad_request', message: '候補日を選んでください' }, { status: 400, headers: noStore });

  await db.updateRound(params.id, { date: opt.date, ...(opt.startTime ? { startTime: opt.startTime } : {}), dateType: 'fixed', eventDatePending: false, eventDecidedAt: Date.now() } as any);

  try {
    const { roundWhenLabel } = await import('@/lib/roundInvite');
    const when = roundWhenLabel({ date: opt.date, startTime: opt.startTime || round.startTime } as any);
    const link = `/round/${params.id}`;
    const answers = round.eventAnswers || {};
    const targets = Array.from(new Set([
      ...(round.applicantIds || []),
      ...Object.keys(answers).filter((u) => answers[u]?.status === 'maybe'),
    ])).filter((u) => u && u !== meId);
    const text = `📅「${round.title}」は ${when} に決まりました！`;
    const { addNotificationMany } = await import('@/lib/notifications');
    addNotificationMany(targets, 'roundUpcoming', text, link).catch(() => {});
    const users = (await Promise.all(targets.map((u) => db.getUser(u)))).filter(Boolean) as any[];
    const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
    const line = users.filter((u) => isNotifyEnabled(u, 'roundUpcoming')).map((u) => u.id);
    if (line.length) {
      const { pushToMany, liffUrl } = await import('@/lib/linePush');
      pushToMany(line, `${text}\n行けるかどうか、もう一度確認してください（行けなくなったら「行けない」に変えてください）。`, liffUrl(link), 'event_date').catch(() => {});
    }
  } catch { /* 通知の失敗は決定を妨げない */ }

  const updated = await db.getRound(params.id);
  const { stripRoundForViewer } = await import('@/lib/roundView');
  return NextResponse.json({ ok: true, round: updated ? stripRoundForViewer(updated, meId) : null }, { headers: noStore });
}
