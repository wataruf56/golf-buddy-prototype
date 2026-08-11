import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { db as appDb } from '@/lib/db';
import type { Round } from '@/lib/types';

// GET /api/me/host-nudge
// ホームで出す「そろそろ募集してみない？」ポップアップを出すべきか判定して返す。
//
// 出す条件（すべて満たす人だけ）:
//   1. ラウンドに参加した経験がある（＝サービスの価値を体験済み。いきなり主催を勧めない）
//   2. まだ一度も主催したことがない（主催経験者には出さない）
//   3. 募集の作成が制限されていない（BAN・noCreate）
// 表示回数の制御（7日に1回・3回閉じたら終了）はクライアント側の localStorage で行う。
//
// あわせて「満員率」を実データから計算して返す（完了した募集のうち、定員が埋まった割合）。
// 数字は自動計算なので、実績が変われば表示も変わる。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

const membersOf = (r: Round) => [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean) as string[];

export async function GET(_req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ show: false }, { headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ show: false }, { headers: noStore });

  try {
    // 募集作成が制限されている人には出さない（押しても作れないため）。
    try {
      const { getRestriction } = await import('@/lib/banAccess');
      if ((await getRestriction(meId)).noCreate) return NextResponse.json({ show: false, reason: 'restricted' }, { headers: noStore });
    } catch { /* 判定不能時は続行 */ }

    const snap = await adb.collection('rounds').limit(1000).get();
    const rounds: Round[] = snap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));

    // 主催経験（共同管理者も「主催した」とみなす）
    const hosted = rounds.some((r) => r.hostId === meId || (r.coHostIds || []).includes(meId));
    if (hosted) return NextResponse.json({ show: false, reason: 'already_host' }, { headers: noStore });

    // 参加経験（完了したラウンドに参加していること。当日欠席は除く）
    const joinedCount = rounds.filter((r) =>
      r.status === 'completed' && (r.applicantIds || []).includes(meId) && !(r.noShowIds || []).includes(meId)
    ).length;
    if (joinedCount === 0) return NextResponse.json({ show: false, reason: 'no_experience' }, { headers: noStore });

    // 満員率＝完了した募集のうち、定員まで埋まった割合（メンバー数 / 定員）。
    const done = rounds.filter((r) => r.status === 'completed');
    let fillRate = 0;
    if (done.length) {
      const sum = done.reduce((a, r) => a + Math.min(1, membersOf(r).length / Math.max(1, r.maxSpots || 1)), 0);
      fillRate = Math.round((sum / done.length) * 100);
    }

    const me = await appDb.getUser(meId);
    return NextResponse.json({
      show: true,
      name: me?.displayName || '',
      joinedCount,
      fillRate,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ show: false, error: (e as Error).message }, { headers: noStore });
  }
}
