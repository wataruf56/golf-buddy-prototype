import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db as appDb } from '@/lib/db';
import { isNoShow } from '@/lib/groups';
import type { Round } from '@/lib/types';

// 過去に「同組で一緒にラウンドした人」の一覧。完了済みラウンド（status==completed）で
// 自分と同じ組だった参加者（主催者＋承認済み applicant）を集めて返す。ゴル友タブの
// 「一緒に回った人」表示に使う。相互レビューやマッチの有無に関わらず全員を並べる。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ partners: [], users: {} }, { headers: noStore });

  try {
    // 複合インデックスを避けるため、単一フィールド条件で2回引いてコードで status を絞る。
    const [asApplicant, asHost] = await Promise.all([
      db.collection('rounds').where('applicantIds', 'array-contains', meId).limit(500).get(),
      db.collection('rounds').where('hostId', '==', meId).limit(500).get(),
    ]);

    const seenRounds = new Set<string>();
    const partnerIds = new Set<string>();
    let lastRoundAt: Record<string, number> = {};

    const consider = (doc: any) => {
      if (seenRounds.has(doc.id)) return;
      seenRounds.add(doc.id);
      const r = { id: doc.id, ...(doc.data() || {}) } as Round;
      if (r.status !== 'completed') return;
      const members: string[] = [r.hostId, ...((r.applicantIds as string[]) || [])].filter(Boolean);
      if (!members.includes(meId)) return;
      if (isNoShow(r, meId)) return; // 自分が当日来られなかった回は対象外
      const when = r.completedAt || r.createdAt || 0;
      // 「一緒に回った」は “同じ組で回った人” だけに付ける。isCompetition フラグに依存せず、
      // 組（groups）が設定されていれば必ず「自分と同じ組のメンバー」だけに絞る（コンペで組が
      // 分かれた場合の対策）。groups が無い通常募集は全員が一緒に回った扱い。
      const groups: any[] = Array.isArray((r as any).groups) ? (r as any).groups : [];
      const myGroupIds: Set<string> | null = groups.length > 0
        ? new Set(((groups.find((g: any) => (g?.memberIds || []).includes(meId))?.memberIds) || []) as string[])
        : null;
      for (const id of members) {
        if (!id || id === meId) continue;
        if (myGroupIds && !myGroupIds.has(id)) continue; // 別の組は除外
        if (isNoShow(r, id)) continue;
        partnerIds.add(id);
        if (when > (lastRoundAt[id] || 0)) lastRoundAt[id] = when;
      }
    };
    asApplicant.docs.forEach(consider);
    asHost.docs.forEach(consider);

    const ids = Array.from(partnerIds);
    const users: Record<string, any> = {};
    await Promise.all(ids.map(async (id) => {
      const u = await appDb.getUser(id);
      users[id] = u
        ? { displayName: u.displayName || 'メンバー', avatar: u.avatar || '⛳', avatarUrl: (u as any).avatarUrl || '', age: u.age || 0, gender: u.gender || '', scoreRange: (u as any).scoreRange || '', reviewAvg: (u as any).reviewAvg || 0, reviewCount: (u as any).reviewCount || 0 }
        : { displayName: 'メンバー', avatar: '⛳' };
    }));

    // 最近一緒に回った順。
    ids.sort((a, b) => (lastRoundAt[b] || 0) - (lastRoundAt[a] || 0));

    return NextResponse.json({ partners: ids, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ partners: [], users: {}, error: (e as Error).message }, { headers: noStore });
  }
}
