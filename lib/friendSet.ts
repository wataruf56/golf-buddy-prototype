import 'server-only';
import { getAdminDb } from './firebase';
import { ADMIN_MANAGER_ID } from './adminManagerId';

// ゴル友の「友達リスト」に出る人の集合（2026-10-14）。画面の /buddies と同じ範囲：
//   friendIds（QR・友達申請でつながった人）＋ レビューでお互いに「行きたい」か「💘」を選んだ相手（_matchLikes の往復）。
// ブロック中の相手・運営（管理人）・自分は除く。プロフィールの「友達」の数と「共通の友達」に使う。
export async function friendSetOf(id: string): Promise<Set<string>> {
  const out = new Set<string>();
  const db = getAdminDb() as any;
  if (!db || !id) return out;
  try {
    const u = (await db.collection('users').doc(id).get()).data() || {};
    for (const x of u.friendIds || []) if (x) out.add(x);
    const mine = await db.collection('_matchLikes').where('from', '==', id).limit(1000).get();
    await Promise.all(mine.docs.map(async (d: any) => {
      const x = d.data() || {};
      if (!x.to || out.has(x.to) || (x.kind !== 'again' && x.kind !== 'romantic')) return;
      const rev = await db.collection('_matchLikes').doc(`${x.kind}__${x.to}__${id}`).get();
      if (rev.exists) out.add(x.to);
    }));
    for (const b of u.blockedUserIds || []) out.delete(b);
  } catch { /* 引けたぶんだけ */ }
  out.delete(ADMIN_MANAGER_ID);
  out.delete(id);
  return out;
}
