import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { mutualMatchKind, getSession, saveSession, pairIdOf } from '@/lib/rematch';
import { applyFeeling, FEELINGS, lastSharedRoundId, type Feeling } from '@/lib/matchFeeling';

// 「まだ一緒にラウンドしてみたいと思う？」（DM画面の上・マッチしている相手のプロフィール）（2026-10-11）
//   GET  ?userId= … { matched: 'again' | 'romantic' | null }（お互いに選んでいるときだけ。片方だけなら null）
//   POST { userId, feeling } … 気持ちを選び直す（lib/matchFeeling）。相手には通知しない。
//        思わない・どっちでも を選ぶとマッチが解け、この欄は消える。再会のやり取りがあれば終了にする。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ matched: null }, { headers: noStore });
  const other = new URL(req.url).searchParams.get('userId') || '';
  if (!other || other === meId) return NextResponse.json({ matched: null }, { headers: noStore });
  return NextResponse.json({ matched: await mutualMatchKind(meId, other) }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const other = String(body.userId || '');
  const feeling = String(body.feeling || '') as Feeling;
  if (!other || other === meId || !FEELINGS.includes(feeling)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  // マッチしている相手だけ（ここから新しくマッチを作ることはしない）
  if (!(await mutualMatchKind(meId, other))) return NextResponse.json({ error: 'not_matched', message: 'マッチしている相手だけ選び直せます' }, { status: 403, headers: noStore });
  const roundId = await lastSharedRoundId(meId, other);
  await applyFeeling(meId, other, feeling, roundId);
  // 再会のやり取りがあれば合わせる（行きたい・💘＝種類を合わせる／それ以外＝終了）
  try {
    const pairId = pairIdOf(meId, other);
    const s = await getSession(pairId);
    if (s) {
      if (feeling === 'again' || feeling === 'romantic') await saveSession(pairId, { matchKind: feeling } as any);
      else await saveSession(pairId, { optedOutBy: Array.from(new Set([...(s.optedOutBy || []), meId])), status: 'optedout' } as any);
    }
  } catch { /* noop */ }
  return NextResponse.json({ ok: true, feeling, matched: await mutualMatchKind(meId, other) }, { headers: noStore });
}
