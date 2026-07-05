import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, saveSession, membersOfPair, overlapDates, recordRematchEvent, notifyRematch } from '@/lib/rematch';
import { getRematchConfig } from '@/lib/rematchConfig';

// POST /api/rematch/[pairId]/candidates  body: { dates: string[] }
// 自分の候補日を登録/更新（トグル済みの全量を受け取る）。相手へ③往復通知を発火。
const noStore = { 'Cache-Control': 'no-store' };
const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });
  if ((s.optedOutBy || []).includes(meId)) return NextResponse.json({ error: 'opted_out' }, { status: 403, headers: noStore });
  if (s.status === 'agreed' || s.status === 'posted') return NextResponse.json({ error: 'already_agreed' }, { status: 409, headers: noStore });

  const cfg = await getRematchConfig();
  const today = jstToday();
  const maxDate = new Date(Date.now() + (9 * 3600 + cfg.candidateWindowDays * 86400) * 1000).toISOString().slice(0, 10);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const rawDates: string[] = (Array.isArray(body?.dates) ? body.dates : []).map((x: any) => String(x));
  const dates: string[] = Array.from(new Set(
    rawDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= maxDate),
  )).sort().slice(0, 60);

  const isA = s.userA === meId;
  const mineKey = isA ? 'candidatesA' : 'candidatesB';
  const theirs = (isA ? s.candidatesB : s.candidatesA) || [];

  await saveSession(pairId, {
    [mineKey]: dates,
    status: s.status === 'notified' ? 'inputting' : s.status,
  } as any);

  // 計測：片方入力、両者入力そろったら both。
  recordRematchEvent('rematch_input_one', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});
  if (dates.length > 0 && theirs.length > 0) {
    recordRematchEvent('rematch_input_both', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});
  }

  // ③ 相手へ往復通知（放置による熱冷め防止）。
  const otherId = isA ? s.userB : s.userA;
  const me = await db.getUser(meId);
  const myName = me?.displayName || '相手';
  await notifyRematch(otherId, `📅 ${myName}さんが再会の候補日を入れました。あなたの行ける日も出して、重なりを確認しましょう👇`, `/rematch/${pairId}`);

  return NextResponse.json({ ok: true, myCandidates: dates, overlap: overlapDates(dates, theirs) }, { headers: noStore });
}
