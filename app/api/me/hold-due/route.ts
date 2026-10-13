import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';

// GET /api/me/hold-due … 主催者（共同管理者も）の「保留にしていた日時になりました」ポップアップの中身（2026-10-13・lib/roundHold）
//   { items: [{ roundId, roundTitle, roundLabel, userId, name, avatar…, until, answer }], nextAt }
//   items  … 期日が来た保留。募集が消えた・完了・中止・申請者が取り下げた／承認・見送り済みのものは入れない
//   nextAt … まだ期日が来ていない保留のうち、いちばん早い期日（画面はその時刻にもう一度取りに来る）
// 利用停止中の人には何も返さない。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ items: [], nextAt: null }, { headers: noStore });
  try {
    const { isBanned } = await import('@/lib/banAccess');
    if (await isBanned(meId)) return NextResponse.json({ items: [], nextAt: null }, { headers: noStore });
  } catch { /* 判定できなければ続ける */ }
  const { dueHoldsForHost, nextHoldDueAt, holdRoundLabel } = await import('@/lib/roundHold');
  const rounds = await db.listRoundsForUser(meId);
  const now = Date.now();
  const due = dueHoldsForHost(rounds, meId, now);
  const users = due.length ? await db.listUsers(Array.from(new Set(due.map((d) => d.userId)))) : [];
  const items = due.map(({ round, userId, hold }) => {
    const u = users.find((x) => x?.id === userId) as any;
    return {
      roundId: round.id,
      roundTitle: round.title || round.courseName || 'ラウンド',
      roundLabel: holdRoundLabel(round as any),
      userId,
      name: u?.displayName || 'メンバー',
      avatar: u?.avatar || '', avatarUrl: u?.avatarUrl || '', color: u?.color || '', avatarMode: u?.avatarMode, golmotiType: u?.golmotiType,
      gender: u?.gender || '', age: u?.age || 0,
      until: hold.until,
      answer: hold.answer || null,
    };
  });
  return NextResponse.json({ items, nextAt: nextHoldDueAt(rounds, meId, now) }, { headers: noStore });
}
