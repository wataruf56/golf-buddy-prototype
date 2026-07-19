import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// あるユーザーの「実績ベース評価」用データ。
//   roundedWith : これまで完了ラウンドで同組になった人数（重複なしの実人数）
//   againCount  : そのうち「また一緒に回りたい」を押してくれた人数
//                 （＝_matchLikes の kind:'again' で to==このユーザー。
//                   「異性として気になる」は また回りたい を内包するため自動で含まれる）
// 将来的にはこの2値から「星」を自動算出する想定。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = String(params.id || '');
  const db = getAdminDb() as any;
  if (!id || !db) return NextResponse.json({ roundedWith: 0, againCount: 0 }, { headers: noStore });

  try {
    // 同組になった実人数（完了ラウンド）。複合インデックス回避のため2クエリ＋コード絞り込み。
    const [asApplicant, asHost] = await Promise.all([
      db.collection('rounds').where('applicantIds', 'array-contains', id).limit(500).get(),
      db.collection('rounds').where('hostId', '==', id).limit(500).get(),
    ]);
    const seenRounds = new Set<string>();
    const partners = new Set<string>();
    let hostedCount = 0;   // 募集回数（完了ラウンドで主催）
    let joinedCount = 0;   // 参加回数（完了ラウンドに参加者として参加）
    const consider = (doc: any) => {
      if (seenRounds.has(doc.id)) return;
      seenRounds.add(doc.id);
      const r = doc.data() || {};
      if (r.status !== 'completed') return;
      const members: string[] = [r.hostId, ...((r.applicantIds as string[]) || [])].filter(Boolean);
      if (!members.includes(id)) return;
      if (r.hostId === id) hostedCount++; else joinedCount++;
      for (const m of members) if (m && m !== id) partners.add(m);
    };
    asApplicant.docs.forEach(consider);
    asHost.docs.forEach(consider);

    // このユーザーを「レビューした人」（＝評価をくれた人）。分母はここに限定する：
    // 一緒に回っても“未レビュー”の人は「また回りたい」の分母に入れない。
    const revSnap = await db.collection('reviews').where('revieweeId', '==', id).limit(1000).get();
    const reviewers = new Set<string>();
    revSnap.docs.forEach((d: any) => { const x = d.data() || {}; if (x.reviewerId) reviewers.add(x.reviewerId); });

    // 「また回りたい」を押した人（like ベース。旧★レビューでも like があれば拾える）。
    const likeSnap = await db.collection('_matchLikes').where('to', '==', id).limit(3000).get();
    const againFrom = new Set<string>();
    likeSnap.docs.forEach((d: any) => {
      const x = d.data() || {};
      if (x.kind === 'again' && x.from) againFrom.add(x.from);
    });

    // 分母 = レビューをくれた人数。分子 = そのうち「また回りたい」を押した人数。
    const roundedWith = reviewers.size;
    let againCount = 0;
    reviewers.forEach((r) => { if (againFrom.has(r)) againCount++; });

    return NextResponse.json({ roundedWith, againCount, hostedCount, joinedCount }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ roundedWith: 0, againCount: 0, hostedCount: 0, joinedCount: 0, error: (e as Error).message }, { headers: noStore });
  }
}
