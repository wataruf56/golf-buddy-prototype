import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { getSession, saveSession, membersOfPair, overlapDates, recordRematchEvent, notifyRematch } from '@/lib/rematch';

// POST /api/rematch/[pairId]/agree  body: { date: 'YYYY-MM-DD' }
// 重なっている日で「この日で決定」。両者に成立通知。= 再会エンジンの成功(コンバージョン)。
const noStore = { 'Cache-Control': 'no-store' };
const mdLabel = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? `${Number(m[2])}/${Number(m[3])}` : d; };

export async function POST(req: NextRequest, { params }: { params: { pairId: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const pairId = params.pairId;
  const [m1, m2] = membersOfPair(pairId);
  if (meId !== m1 && meId !== m2) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });

  const s = await getSession(pairId);
  if (!s) return NextResponse.json({ error: 'notfound' }, { status: 404, headers: noStore });
  if ((s.optedOutBy || []).includes(meId)) return NextResponse.json({ error: 'opted_out' }, { status: 403, headers: noStore });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const date = String(body?.date || '');
  const overlap = overlapDates(s.candidatesA || [], s.candidatesB || []);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !overlap.includes(date)) {
    return NextResponse.json({ error: 'date_not_in_overlap' }, { status: 400, headers: noStore });
  }

  await saveSession(pairId, { agreedDate: date, agreedAt: Date.now(), status: 'agreed' } as any);
  recordRematchEvent('rematch_agreed', { pairId, roundId: s.roundId, cycle: s.notifyCount, userId: meId }).catch(() => {});

  // 両者へ成立通知。
  const [ua, ub] = await Promise.all([db.getUser(s.userA), db.getUser(s.userB)]);
  const link = `/rematch/${pairId}`;
  const label = mdLabel(date);
  await Promise.all([
    notifyRematch(s.userA, `🎉 ${ub?.displayName || '相手'}さんとの再会が ${label} で決まりました！このままラウンドを立てましょう👇`, link),
    notifyRematch(s.userB, `🎉 ${ua?.displayName || '相手'}さんとの再会が ${label} で決まりました！このままラウンドを立てましょう👇`, link),
  ]);

  return NextResponse.json({ ok: true, agreedDate: date }, { headers: noStore });
}
