import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { getMeId } from '@/lib/session';

// POST /api/users/ratings  body: { ids: string[] }
// 複数ユーザーの「また回りたい率」評価を、実際のレビュー/評価データから一括算出して返す。
// track-record（単体）と同じ定義：
//   roundedWith = このユーザーをレビューした人数（＝分母）
//   againCount  = そのうち「また回りたい」を押した人数
//   neverCount  = そのうち「ごめんなさい(never)」を付けた人数
// N+1 を避けるため、reviews は revieweeId、_matchLikes は to の `in` クエリでまとめて取得する。
const noStore = { 'Cache-Control': 'no-store' };
const MAX_IDS = 90;   // 表示上限。30件ずつのチャンクで処理。
const CHUNK = 30;     // Firestore `in` の上限。

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ ratings: {} }, { headers: noStore });

  let ids: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.ids)) ids = body.ids.filter((x: any) => typeof x === 'string' && x).slice(0, MAX_IDS);
  } catch { /* ignore */ }
  ids = Array.from(new Set(ids));
  if (ids.length === 0) return NextResponse.json({ ratings: {} }, { headers: noStore });

  // uid → レビューした人の集合 / never を付けた人の集合 / また回りたいを押した人の集合。
  const reviewers: Record<string, Set<string>> = {};
  const neverFrom: Record<string, Set<string>> = {};
  const againFrom: Record<string, Set<string>> = {};
  for (const id of ids) { reviewers[id] = new Set(); neverFrom[id] = new Set(); againFrom[id] = new Set(); }

  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const [revSnap, likeSnap] = await Promise.all([
        db.collection('reviews').where('revieweeId', 'in', chunk).limit(3000).get(),
        db.collection('_matchLikes').where('to', 'in', chunk).limit(5000).get(),
      ]);
      revSnap.docs.forEach((d: any) => {
        const x = d.data() || {};
        const to = x.revieweeId; const from = x.reviewerId;
        if (!to || !from || !reviewers[to]) return;
        reviewers[to].add(from);
        if (x.verdict === 'never') neverFrom[to].add(from);
      });
      likeSnap.docs.forEach((d: any) => {
        const x = d.data() || {};
        if (x.kind !== 'again') return;
        const to = x.to; const from = x.from;
        if (!to || !from || !againFrom[to]) return;
        againFrom[to].add(from);
      });
    }
  } catch (e) {
    return NextResponse.json({ ratings: {}, error: (e as Error).message }, { headers: noStore });
  }

  const ratings: Record<string, { roundedWith: number; againCount: number; neverCount: number }> = {};
  for (const id of ids) {
    const rev = reviewers[id];
    let againCount = 0; let neverCount = 0;
    rev.forEach((r) => {
      if (againFrom[id].has(r)) againCount++;
      if (neverFrom[id].has(r)) neverCount++;
    });
    ratings[id] = { roundedWith: rev.size, againCount, neverCount };
  }

  return NextResponse.json({ ratings }, { headers: noStore });
}
