import 'server-only';

// LPに載せる実績数値。手で書いた数字はすぐ古くなり事実と食い違うので、必ず実データから出す。
// 母数(n)も一緒に返し、少なすぎるものは表示側で落とす。
//
// LP本体（app/lp/page.tsx）と確認用API（/api/lp/stats）で同じ計算を使う。
export type LpStats = {
  fillRate: number | null; fillN: number;         // 募集の満員率
  totalPlayers: number;                            // のべ参加人数（同じ人の重複を含む）
  againRate: number | null; againN: number;       // また回りたい率
  femaleRate: number | null; genderN: number;     // 女性比率
  avgAge: number | null; ageN: number;            // 平均年齢
};

export const EMPTY_LP_STATS: LpStats = {
  fillRate: null, fillN: 0, totalPlayers: 0, againRate: null, againN: 0,
  femaleRate: null, genderN: 0, avgAge: null, ageN: 0,
};

export async function computeLpStats(db: any): Promise<LpStats> {
  const stats: LpStats = { ...EMPTY_LP_STATS };

  const [rSnap, uSnap, revSnap, likeSnap] = await Promise.all([
    db.collection('rounds').limit(2000).get(),
    db.collection('users').limit(2000).get(),
    db.collection('reviews').limit(5000).get(),
    db.collection('_matchLikes').limit(8000).get(),
  ]);

  // 完了した募集（飲み会と検証用アカウントの投稿は除く）。LPに出す実績はここから作る。
  const membersOf = (r: any) => [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean);
  const done = rSnap.docs.map((d: any) => d.data() || {})
    .filter((r: any) => r.status === 'completed' && r.eventType !== 'drink'
      && !String(r.hostId || '').startsWith('test_'));
  stats.fillN = done.length;
  if (done.length) {
    const sum = done.reduce(
      (a: number, r: any) => a + Math.min(1, membersOf(r).length / Math.max(1, r.maxSpots || 1)),
      0,
    );
    stats.fillRate = Math.round((sum / done.length) * 100);
  }

  // のべ参加人数＝完了した募集ごとの参加者数を単純に足したもの。
  // 同じ人が何回参加していても、その都度1人と数える（重複あり）。
  // 当日来られなかった人（noShowIds）は数えない。
  stats.totalPlayers = done.reduce((a: number, r: any) => {
    const noShow = new Set<string>(r.noShowIds || []);
    return a + membersOf(r).filter((m: string) => !noShow.has(m)).length;
  }, 0);

  // また回りたい率＝「レビューをくれた人」のうち「また回りたい」を押した人の割合
  const reviewersOf: Record<string, Set<string>> = {};
  revSnap.docs.forEach((d: any) => {
    const x = d.data() || {};
    if (!x.revieweeId || !x.reviewerId) return;
    (reviewersOf[x.revieweeId] = reviewersOf[x.revieweeId] || new Set()).add(x.reviewerId);
  });
  const againOf: Record<string, Set<string>> = {};
  likeSnap.docs.forEach((d: any) => {
    const x = d.data() || {};
    if (x.kind !== 'again' || !x.from || !x.to) return;
    (againOf[x.to] = againOf[x.to] || new Set()).add(x.from);
  });
  let ag = 0, pairs = 0;
  Object.entries(reviewersOf).forEach(([to, revs]) => {
    (revs as Set<string>).forEach((from) => { pairs++; if (againOf[to]?.has(from)) ag++; });
  });
  stats.againN = pairs;
  if (pairs) stats.againRate = Math.round((ag / pairs) * 100);

  // 会員の属性（システム・テストは除外）
  let male = 0, female = 0, ageSum = 0, ageN = 0;
  uSnap.docs.forEach((d: any) => {
    const u = d.data() || {};
    if (u.isSystem || u.isTestAccount) return;
    if (u.gender === 'male') male++; else if (u.gender === 'female') female++;
    const age = Number(u.age || 0);
    if (age >= 15 && age <= 90) { ageSum += age; ageN++; }
  });
  stats.genderN = male + female;
  if (stats.genderN) stats.femaleRate = Math.round((female / stats.genderN) * 100);
  stats.ageN = ageN;
  if (ageN) stats.avgAge = Math.round(ageSum / ageN);

  return stats;
}
