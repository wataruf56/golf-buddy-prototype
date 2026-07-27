import 'server-only';
import { getAdminDb } from './firebase';
import { isNoShow } from './groups';
import type { Round } from './types';

// あるユーザーが「過去に同じ組で回った人」のIDセット。
//   - 完了ラウンド（status==='completed'）のみ
//   - 同じ組（groups があれば自分と同組のメンバーだけ／通常募集は全員が同組扱い）
//   - 当日来れなかった人（noShow）は自分・相手いずれも除外
// 「共通の友達」= 2ユーザーのこのセットの積集合。
export async function sameGroupPartnerIds(userId: string): Promise<Set<string>> {
  const result = new Set<string>();
  const db = getAdminDb() as any;
  if (!db || !userId) return result;
  try {
    const [asApplicant, asHost] = await Promise.all([
      db.collection('rounds').where('applicantIds', 'array-contains', userId).limit(500).get(),
      db.collection('rounds').where('hostId', '==', userId).limit(500).get(),
    ]);
    const seen = new Set<string>();
    const consider = (doc: any) => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      const r = { id: doc.id, ...(doc.data() || {}) } as Round;
      if (r.status !== 'completed') return;
      // 飲み会などゴルフ以外のイベントは「一緒に回った」に数えない。
      if ((r as any).eventType === 'drink') return;
      const members: string[] = [r.hostId, ...((r.applicantIds as string[]) || [])].filter(Boolean);
      if (!members.includes(userId)) return;
      if (isNoShow(r, userId)) return;
      const groups: any[] = Array.isArray((r as any).groups) ? (r as any).groups : [];
      const myGroup: Set<string> | null = groups.length > 0
        ? new Set(((groups.find((g: any) => (g?.memberIds || []).includes(userId))?.memberIds) || []) as string[])
        : null;
      for (const id of members) {
        if (!id || id === userId) continue;
        if (myGroup && !myGroup.has(id)) continue; // 別の組は除外
        if (isNoShow(r, id)) continue;
        result.add(id);
      }
    };
    asApplicant.docs.forEach(consider);
    asHost.docs.forEach(consider);
  } catch { /* best-effort */ }
  return result;
}
