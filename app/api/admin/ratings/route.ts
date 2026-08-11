import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：全ユーザーの評価状況を一覧＋一人ずつ詳しく見るためのデータ。
//
// アプリ側の ★（また回りたい率）と同じ定義でそろえる（lib/utils.revisitStar）：
//   分母 roundedWith = そのユーザーをレビューした人数
//   減点 neverCount  = そのうち「ごめんなさい」(verdict:'never') を付けた人数
//   星               = (1 - never/rounded) * 5
// これに実績（完了ラウンドの参加/主催）とマナーペナルティを添えて、
// 「誰がどう評価されているか」を1画面で追えるようにする。
//
// reviews / _matchLikes / rounds / users を1回ずつ全件読んでメモリで突き合わせる。
// ユーザーごとにクエリを撃つと人数分のラウンドトリップになるため。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  try {
    const [uSnap, rSnap, revSnap, likeSnap] = await Promise.all([
      db.collection('users').limit(2000).get(),
      db.collection('rounds').limit(2000).get(),
      db.collection('reviews').limit(5000).get(),
      db.collection('_matchLikes').limit(8000).get(),
    ]);

    const users = uSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
    const nameOf: Record<string, string> = {};
    users.forEach((u: any) => { nameOf[u.id] = u.displayName || '（名前なし）'; });

    // --- 実績（完了ラウンド。飲み会は除く。当日欠席はカウントしない）---
    const stat: Record<string, { hosted: number; joined: number; noShow: number; partners: Set<string> }> = {};
    const of = (id: string) => (stat[id] = stat[id] || { hosted: 0, joined: 0, noShow: 0, partners: new Set() });
    for (const d of rSnap.docs) {
      const r: any = { id: d.id, ...(d.data() || {}) };
      if (r.status !== 'completed' || r.eventType === 'drink') continue;
      const members: string[] = [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean);
      const noShow = new Set<string>(r.noShowIds || []);
      for (const m of members) {
        if (noShow.has(m)) { of(m).noShow++; continue; }
        if (r.hostId === m || (r.coHostIds || []).includes(m)) of(m).hosted++; else of(m).joined++;
        for (const o of members) if (o && o !== m && !noShow.has(o)) of(m).partners.add(o);
      }
    }

    // --- 受けたレビュー ---
    type Rev = { from: string; fromName: string; verdict: string; comment: string; ts: number };
    const received: Record<string, Rev[]> = {};
    const gaveCount: Record<string, number> = {};
    for (const d of revSnap.docs) {
      const x: any = d.data() || {};
      const to = String(x.revieweeId || ''); const from = String(x.reviewerId || '');
      if (!to || !from) continue;
      (received[to] = received[to] || []).push({
        from, fromName: nameOf[from] || '(未登録)',
        verdict: String(x.verdict || ''),
        comment: String(x.comment || x.text || '').slice(0, 300),
        ts: Number(x.createdAt || x.ts || 0),
      });
      gaveCount[from] = (gaveCount[from] || 0) + 1;
    }

    // --- 「また回りたい」の like（kind:'again'。romantic は again を内包）---
    const againFrom: Record<string, Set<string>> = {};
    const againTo: Record<string, Set<string>> = {};
    for (const d of likeSnap.docs) {
      const x: any = d.data() || {};
      if (x.kind !== 'again' || !x.from || !x.to) continue;
      (againFrom[x.to] = againFrom[x.to] || new Set()).add(x.from);
      (againTo[x.from] = againTo[x.from] || new Set()).add(x.to);
    }

    const rows = users
      .filter((u: any) => !u.isSystem)
      .map((u: any) => {
        const revs = (received[u.id] || []).sort((a, b) => b.ts - a.ts);
        const reviewers = new Set(revs.map((r) => r.from));
        const never = new Set(revs.filter((r) => r.verdict === 'never').map((r) => r.from));
        const again = againFrom[u.id] || new Set<string>();
        const roundedWith = reviewers.size;
        let againCount = 0, neverCount = 0;
        reviewers.forEach((r) => { if (again.has(r)) againCount++; if (never.has(r)) neverCount++; });
        const star = roundedWith > 0 ? Math.round((1 - neverCount / roundedWith) * 5 * 2) / 2 : null;
        const s = stat[u.id] || { hosted: 0, joined: 0, noShow: 0, partners: new Set() };
        return {
          id: u.id,
          name: u.displayName || '（名前なし）',
          avatarUrl: u.avatarUrl || '',
          isTest: !!u.isTestAccount,
          star,                                   // null = まだ評価なし（🆕 初参加）
          roundedWith, againCount, neverCount,
          againRate: roundedWith ? Math.round((againCount / roundedWith) * 100) : 0,
          hosted: s.hosted, joined: s.joined, noShow: s.noShow,
          partners: s.partners.size,
          mannerPenalty: Number(u.mannerPenalty || 0),
          gaveReviews: gaveCount[u.id] || 0,      // その人が他人にしたレビュー数（協力度）
          againGiven: (againTo[u.id] || new Set()).size,
          reviews: revs.slice(0, 30),             // 受けたレビュー（新しい順）
        };
      });

    // 気になる人が上に来る並び：ペナルティあり → ごめんなさりあり → 星が低い → 実績が多い
    rows.sort((a: any, b: any) => {
      if (b.mannerPenalty !== a.mannerPenalty) return b.mannerPenalty - a.mannerPenalty;
      if (b.neverCount !== a.neverCount) return b.neverCount - a.neverCount;
      const as = a.star == null ? 99 : a.star, bs = b.star == null ? 99 : b.star;
      if (as !== bs) return as - bs;
      return (b.hosted + b.joined) - (a.hosted + a.joined);
    });

    const rated = rows.filter((r: any) => r.roundedWith > 0);
    const summary = {
      users: rows.length,
      rated: rated.length,
      unrated: rows.length - rated.length,
      avgStar: rated.length ? Math.round((rated.reduce((a: number, r: any) => a + (r.star || 0), 0) / rated.length) * 10) / 10 : 0,
      withNever: rows.filter((r: any) => r.neverCount > 0).length,
      withPenalty: rows.filter((r: any) => r.mannerPenalty > 0).length,
      totalReviews: revSnap.size,
    };

    return NextResponse.json({ generatedAt: Date.now(), summary, rows }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
