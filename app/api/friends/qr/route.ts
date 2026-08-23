import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { createDirectReview, saveQrAnswers, tomorrowMorningJst } from '@/lib/friendLink';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// POST /api/friends/qr  { answers: [{ otherId, answer: 'same_group' | 'other' }] }
//
// QRでつながった人に「同じ組で回ったか」をまとめて答える。
// 答えた人だけリストから消え、答えていない人はずっと残る（せかさない）。
// 「同じ組」にした相手には **翌朝** レビュー依頼が届く。
// ※ QRを読み取ったその場では何も聞かない（複数人で交換し合うため）。
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { blockedIfBanned } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const raw = Array.isArray(body?.answers) ? body.answers : [];
  const answers = raw
    .map((a: any) => ({ otherId: String(a?.otherId || ''), answer: String(a?.answer || '') }))
    .filter((a: any) => a.otherId && a.otherId !== meId && (a.answer === 'same_group' || a.answer === 'other'))
    .slice(0, 50);

  if (!answers.length) {
    return NextResponse.json({ error: 'bad_request', message: '選択してください' }, { status: 400, headers: noStore });
  }

  const { sameGroup } = await saveQrAnswers(meId, answers as any);

  // 翌朝9時にレビュー依頼。当日の夜に催促するのはやめた（交換した日のうちに
  // 答えるとは限らないし、通知が増えるだけなので）。
  const dueAt = tomorrowMorningJst();
  await Promise.all(sameGroup.map((otherId) =>
    createDirectReview({ reviewerId: meId, revieweeId: otherId, source: 'qr', dueAt }),
  ));

  return NextResponse.json({
    ok: true, saved: answers.length, sameGroup: sameGroup.length, reviewDueAt: dueAt,
  }, { headers: noStore });
}
