import 'server-only';
import { getAdminDb } from './firebase';

// タイムラインに載せる「出来事」のうち、ほかのデータから組み立てられないものを記録する（2026-10-12）。
//   join … 参加が**確定した**とき（主催者の承認・招待の受諾・知り合い枠の本人への置き換え・空き待ちからの承認）。
//          申請しただけ（承認待ち）は載せない。あとで取りやめた人は、表示のときに外す（lib/timeline）。
// id は 'join_<募集>_<人>' で決まる＝同じ人が同じ募集に何度承認されても1行。
export async function recordTimelineJoin(roundId: string, userId: string): Promise<void> {
  const adb = getAdminDb() as any;
  if (!adb || !roundId || !userId) return;
  try {
    const ref = adb.collection('_timelineEvents').doc(`join_${roundId}_${userId}`);
    const cur = await ref.get();
    if (cur.exists) return;   // 最初に参加した時刻を残す
    await ref.set({ kind: 'join', roundId, userId, at: Date.now() });
  } catch (e) {
    console.warn('[timelineEvents] join write failed', (e as Error).message);
  }
}
