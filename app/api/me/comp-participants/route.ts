import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db as appDb } from '@/lib/db';
import { isNoShow } from '@/lib/groups';
import type { Round } from '@/lib/types';

// 過去に「同じコンペ（isCompetition の完了ラウンド）」に一緒に参加した人の一覧。
// 「一緒に回った（同組）」とは違い、組が分かれていても同じコンペにいた全員を返す。
// 友達タブの「過去に同じコンペに参加したことがある人」タブ＋DM導線に使う。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ participants: [], users: {} }, { headers: noStore });

  try {
    const [asApplicant, asHost] = await Promise.all([
      db.collection('rounds').where('applicantIds', 'array-contains', meId).limit(500).get(),
      db.collection('rounds').where('hostId', '==', meId).limit(500).get(),
    ]);

    const seenRounds = new Set<string>();
    const ids = new Set<string>();
    const lastRoundAt: Record<string, number> = {};

    const consider = (doc: any) => {
      if (seenRounds.has(doc.id)) return;
      seenRounds.add(doc.id);
      const r = { id: doc.id, ...(doc.data() || {}) } as Round;
      if (r.status !== 'completed') return;
      if (!r.isCompetition) return; // コンペのみ
      const members: string[] = [r.hostId, ...((r.applicantIds as string[]) || [])].filter(Boolean);
      if (!members.includes(meId)) return;
      const when = r.completedAt || r.createdAt || 0;
      for (const id of members) {
        if (!id || id === meId) continue;
        if (isNoShow(r, id)) continue; // 当日欠席は除外
        ids.add(id);
        if (when > (lastRoundAt[id] || 0)) lastRoundAt[id] = when;
      }
    };
    asApplicant.docs.forEach(consider);
    asHost.docs.forEach(consider);

    const list = Array.from(ids);
    const users: Record<string, any> = {};
    await Promise.all(list.map(async (id) => {
      const u = await appDb.getUser(id);
      users[id] = u
        ? { displayName: u.displayName || 'メンバー', avatar: u.avatar || '⛳', avatarUrl: (u as any).avatarUrl || '', age: u.age || 0, gender: u.gender || '', scoreRange: (u as any).scoreRange || '' }
        : { displayName: 'メンバー', avatar: '⛳' };
    }));

    list.sort((a, b) => (lastRoundAt[b] || 0) - (lastRoundAt[a] || 0));

    return NextResponse.json({ participants: list, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ participants: [], users: {}, error: (e as Error).message }, { headers: noStore });
  }
}
