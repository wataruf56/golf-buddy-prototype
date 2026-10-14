import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';

// POST /api/rounds/[id]/event-remind … イベントの「未回答の人」へリマインド（主催者が押したときだけ・12時間に1回まで）（2026-10-14）。
// 未回答＝招待中で、まだ出欠を答えていない人。お知らせ＋LINE（「💌 招待された」の設定がONの人）。
const noStore = { 'Cache-Control': 'no-store' };
const COOLDOWN = 12 * 3600 * 1000;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const last = Number(round.eventRemindAt || 0);
  if (last && Date.now() - last < COOLDOWN) {
    return NextResponse.json({ error: 'cooldown', message: 'リマインドは12時間に1回までです', nextAt: last + COOLDOWN }, { status: 429, headers: noStore });
  }
  const answers = round.eventAnswers || {};
  const targets = (round.invitedIds || []).filter((u) => u && !answers[u]);
  if (!targets.length) return NextResponse.json({ ok: true, sent: 0 }, { headers: noStore });
  await db.updateRound(params.id, { eventRemindAt: Date.now() } as any);
  const host = await db.getUser(round.hostId);
  const link = `/round/${params.id}`;
  const text = `⏰ ${host?.displayName || '主催者'}さんから：「${round.title}」の出欠をまだもらっていません。行けるかどうか、お返事ください`;
  const { addNotificationMany } = await import('@/lib/notifications');
  addNotificationMany(targets, 'invited', text, link).catch(() => {});
  const users = (await Promise.all(targets.map((u) => db.getUser(u)))).filter(Boolean) as any[];
  const { isNotifyEnabled } = await import('@/lib/notifyPrefs');
  const line = users.filter((u) => isNotifyEnabled(u, 'invited')).map((u) => u.id);
  if (line.length) {
    const { pushToMany, liffUrl } = await import('@/lib/linePush');
    pushToMany(line, text, liffUrl(link), 'event_remind').catch(() => {});
  }
  return NextResponse.json({ ok: true, sent: targets.length }, { headers: noStore });
}
