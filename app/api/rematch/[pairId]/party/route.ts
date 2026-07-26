import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getSession, saveSession, membersOfPair } from '@/lib/rematch';

// POST /api/rematch/[pairId]/party  body: { sizes: string[] }  ('2'|'3'|'4')
// 再会の「希望人数」（2サム/3サム/フォーサム。複数可＝〜でもいい）を自分側に「黙って保存」する。
// チャット投稿も通知も出さない（相手は再会画面のグレー表示で確認できる）。
const noStore = { 'Cache-Control': 'no-store' };

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
  const sizes: string[] = Array.from(new Set(
    (Array.isArray(body?.sizes) ? body.sizes : []).map((x: any) => String(x)).filter((x: string) => ['2', '3', '4'].includes(x)),
  ));

  const isA = s.userA === meId;
  await saveSession(pairId, { [isA ? 'partyPrefA' : 'partyPrefB']: sizes } as any);

  // 希望人数も「黙って保存」する。チャット投稿も通知も出さない（相手は再会画面のグレー表示で
  // 確認できる）。日程の「候補日を送る」「この日で決定」は従来どおり通知する。
  return NextResponse.json({ ok: true, myParty: sizes }, { headers: noStore });
}
