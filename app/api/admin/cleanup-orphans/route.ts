import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用：既に削除されたラウンドに紐づく「残骸」データを一掃する。
//   - _matchLikes（気になる/また回りたい）… ラウンド削除時に消し忘れていた分
//   - reviews / pendingReviews … 同上
// roundId フィールドを持つのに、その roundId のラウンドが存在しないものを孤児と判定。
// 既存の不具合（ラウンド削除後もマッチ/レビューが残る）を後から掃除するための一回限り運用API。
const noStore = { 'Cache-Control': 'no-store' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  // dryRun=true（既定）なら削除せず件数だけ返す。実削除は ?apply=true。
  const apply = new URL(req.url).searchParams.get('apply') === 'true';

  const result = {
    apply,
    existingRounds: 0,
    likesScanned: 0, likesOrphan: 0, likesDeleted: 0,
    reviewsScanned: 0, reviewsOrphan: 0, reviewsDeleted: 0,
    pendingScanned: 0, pendingOrphan: 0, pendingDeleted: 0,
    revieweesRecomputed: 0,
  };

  try {
    // 現存ラウンドの id 集合。
    const rs = await db.collection('rounds').limit(1000).get();
    const liveRounds = new Set<string>(rs.docs.map((d: any) => d.id));
    result.existingRounds = liveRounds.size;
    const isOrphan = (roundId: any) => typeof roundId === 'string' && roundId.length > 0 && !liveRounds.has(roundId);

    // ① _matchLikes
    {
      const snap = await db.collection('_matchLikes').limit(5000).get();
      result.likesScanned = snap.size;
      const orphans = snap.docs.filter((d: any) => isOrphan(d.data().roundId));
      result.likesOrphan = orphans.length;
      if (apply && orphans.length) {
        for (let i = 0; i < orphans.length; i += 450) {
          const batch = db.batch();
          orphans.slice(i, i + 450).forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
        }
        result.likesDeleted = orphans.length;
      }
    }

    // ② reviews（被レビュー者を集計再計算の対象として控える）
    const recompute = new Set<string>();
    {
      const snap = await db.collection('reviews').limit(5000).get();
      result.reviewsScanned = snap.size;
      const orphans = snap.docs.filter((d: any) => isOrphan(d.data().roundId));
      result.reviewsOrphan = orphans.length;
      orphans.forEach((d: any) => { const x = d.data(); if (x.revieweeId) recompute.add(x.revieweeId); });
      if (apply && orphans.length) {
        for (let i = 0; i < orphans.length; i += 450) {
          const batch = db.batch();
          orphans.slice(i, i + 450).forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
        }
        result.reviewsDeleted = orphans.length;
      }
    }

    // ③ pendingReviews
    {
      const snap = await db.collection('pendingReviews').limit(5000).get();
      result.pendingScanned = snap.size;
      const orphans = snap.docs.filter((d: any) => isOrphan(d.data().roundId));
      result.pendingOrphan = orphans.length;
      if (apply && orphans.length) {
        for (let i = 0; i < orphans.length; i += 450) {
          const batch = db.batch();
          orphans.slice(i, i + 450).forEach((d: any) => batch.delete(d.ref));
          await batch.commit();
        }
        result.pendingDeleted = orphans.length;
      }
    }

    // 被レビュー者の reviewAvg / reviewCount を再計算。
    if (apply) {
      for (const uid of Array.from(recompute)) {
        try {
          const rv = await db.collection('reviews').where('revieweeId', '==', uid).get();
          const reviews = rv.docs.map((d: any) => d.data());
          const count = reviews.length;
          const avg = count ? Math.round((reviews.reduce((s: number, r: any) => s + (r.stars || 0), 0) / count) * 100) / 100 : 0;
          await db.collection('users').doc(uid).set({ reviewCount: count, reviewAvg: avg, updatedAt: Date.now() }, { merge: true });
          result.revieweesRecomputed++;
        } catch {}
      }
    }

    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, ...result }, { status: 500, headers: noStore });
  }
}
