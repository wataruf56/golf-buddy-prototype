import { NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { db } from '@/lib/db';
import { listSessionsForUser, overlapDates } from '@/lib/rematch';

// GET /api/rematch — 自分が当事者の再会セッション一覧（ゴル友タブ等で表示）。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const sessions = await listSessionsForUser(meId);
  const items = await Promise.all(sessions
    .filter((s) => !(s.optedOutBy || []).includes(meId))
    .map(async (s) => {
      const isA = s.userA === meId;
      const otherId = isA ? s.userB : s.userA;
      const mine = isA ? s.candidatesA : s.candidatesB;
      const theirs = isA ? s.candidatesB : s.candidatesA;
      const other = await db.getUser(otherId);
      return {
        pairId: s.pairId,
        status: s.status,
        courseName: s.courseName || '',
        roundDate: s.roundDate || '',
        matchKind: s.matchKind,
        agreedDate: s.agreedDate || null,
        myCount: (mine || []).length,
        overlapCount: overlapDates(mine || [], theirs || []).length,
        other: other ? { id: otherId, displayName: other.displayName || 'メンバー', avatar: other.avatar || '⛳', avatarUrl: (other as any).avatarUrl || '' } : { id: otherId, displayName: 'メンバー', avatar: '⛳' },
      };
    }));
  return NextResponse.json({ items }, { headers: noStore });
}
