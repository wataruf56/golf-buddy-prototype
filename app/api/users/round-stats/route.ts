import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { countedMemberIds } from '@/lib/hostCount';

// POST /api/users/round-stats { ids: string[] } … 募集ページの参加者一覧に出す「ゴルトモで◯回」「公式コンペ◯回」（2026-10-13）
//   rounds   … ゴルトモでラウンドした回数（users.roundCount＝完了したラウンドごとに参加者へ +1）
//   official … ゴルトモ公式コンペ（isOfficial かつコンペ）に参加して完了した回数。完了した公式募集から数える（10分キャッシュ）
// ログインしている人なら誰でも（数字だけ・最大80人）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
let officialCache: { at: number; counts: Map<string, number> } | null = null;

async function officialCounts(adb: any): Promise<Map<string, number>> {
  if (officialCache && Date.now() - officialCache.at < 10 * 60 * 1000) return officialCache.counts;
  const counts = new Map<string, number>();
  const snap = await adb.collection('rounds').where('isOfficial', '==', true).limit(500).get();
  for (const d of snap.docs) {
    const r = { id: d.id, ...(d.data() || {}) } as any;
    if (r.status !== 'completed' || r.heldCancelledAt) continue;
    const isComp = !!r.isCompetition || (Number(r.maxSpots) || 0) >= 5;
    if (!isComp) continue;
    for (const uid of countedMemberIds(r)) counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  officialCache = { at: Date.now(), counts };
  return counts;
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ stats: {} }, { headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const ids: string[] = Array.from(new Set<string>((Array.isArray(body.ids) ? body.ids : []).map((x: any) => String(x || '')).filter((x: string) => /^[A-Za-z0-9_-]{3,64}$/.test(x) && !x.startsWith('gst_')))).slice(0, 80);
  if (!ids.length) return NextResponse.json({ stats: {} }, { headers: noStore });
  const [off, snaps] = await Promise.all([
    officialCounts(adb).catch(() => new Map<string, number>()),
    adb.getAll(...ids.map((id) => adb.collection('users').doc(id))),
  ]);
  const stats: Record<string, { rounds: number; official: number }> = {};
  for (const s of snaps) {
    if (!s.exists) continue;
    stats[s.id] = { rounds: Math.max(0, Number(s.data()?.roundCount) || 0), official: off.get(s.id) || 0 };
  }
  return NextResponse.json({ stats }, { headers: noStore });
}
