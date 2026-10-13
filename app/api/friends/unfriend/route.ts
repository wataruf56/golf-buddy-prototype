import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';

// 友達解除（2026-10-14）。プロフィール・DM画面の「友達解除」ボタンから。
//   GET  ?userId= … { canUnfriend, friend, matched }（ゴル友＝QR・友達申請／レビューで相互に行きたい・💘 のどれか）
//   POST { userId } … 解除する。相手には通知しない。
// 解除は「またその人とラウンドを回りたいか」に「思わない」と答えたのと同じ扱い：
//   お互いの friendIds から外す＋自分の「行きたい／💘」を外してマッチ解除＋直近の一緒だった
//   ラウンドのレビューを「思わない」に（★・「行きたい」の人数に反映）＋DMを双方向で閉じる。
// 運営（管理人）は解除できない（いつでも連絡できる窓口のため）。
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

async function relation(meId: string, other: string) {
  const { mutualMatchKind } = await import('@/lib/rematch');
  const [me, o, matched] = await Promise.all([db.getUser(meId), db.getUser(other), mutualMatchKind(meId, other)]);
  const friend = (me?.friendIds || []).includes(other) || (o?.friendIds || []).includes(meId);
  return { exists: !!o, friend, matched };
}

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ canUnfriend: false }, { headers: noStore });
  const other = new URL(req.url).searchParams.get('userId') || '';
  if (!other || other === meId || other === ADMIN_MANAGER_ID) return NextResponse.json({ canUnfriend: false }, { headers: noStore });
  const r = await relation(meId, other);
  return NextResponse.json({ canUnfriend: r.friend || !!r.matched, friend: r.friend, matched: r.matched }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const other = String(body.userId || '');
  if (!other || other === meId) return NextResponse.json({ error: 'bad_request', message: '相手が正しくありません' }, { status: 400, headers: noStore });
  if (other === ADMIN_MANAGER_ID) return NextResponse.json({ error: 'admin', message: '運営とは友達解除できません' }, { status: 403, headers: noStore });
  const r = await relation(meId, other);
  if (!r.exists) return NextResponse.json({ error: 'not_found', message: '相手が見つかりません' }, { status: 404, headers: noStore });
  if (!r.friend && !r.matched) return NextResponse.json({ error: 'not_friend', message: 'この相手とは友達になっていません' }, { status: 409, headers: noStore });

  const { unlinkFriends } = await import('@/lib/friendLink');
  const { applyFeeling, lastSharedRoundId } = await import('@/lib/matchFeeling');
  await unlinkFriends(meId, other);
  const roundId = await lastSharedRoundId(meId, other);
  await applyFeeling(meId, other, 'never', roundId);
  // 再会のやり取りがあれば終了にする（/api/me/match-feeling の「思わない」と同じ）
  try {
    const { getSession, saveSession, pairIdOf } = await import('@/lib/rematch');
    const pairId = pairIdOf(meId, other);
    const s = await getSession(pairId);
    if (s) await saveSession(pairId, { optedOutBy: Array.from(new Set([...(s.optedOutBy || []), meId])), status: 'optedout' } as any);
  } catch { /* noop */ }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
