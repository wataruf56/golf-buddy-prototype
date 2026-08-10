import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import type { Round } from '@/lib/types';

// 管理画面トップの「事業サマリー」。散らばっていた計測を、意思決定に必要な数字だけに絞って返す。
//
// 考え方（マッチング系サービスの定石）：
//   北極星 = 実際にラウンドした人数（＝価値提供が起きた瞬間）。登録者数は追わない。
//   その下に3つだけ：
//     ① 供給  … 新しく募集を立てた人（特に「初めて立てた人」）。ここが枯れるとサービスが止まる
//     ② 成立  … 立った募集がちゃんと埋まったか（充足率）
//     ③ 定着  … 1回参加した人が戻ってくるか
// さらに「いま危ない募集（開催が近いのに人が集まっていない）」を運用アラートとして返す。
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const DAY = 86400000;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const membersOf = (r: Round) => [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean) as string[];
// 開催日（未定の募集は集計対象外）。
const dateOf = (r: Round) => (r.date ? new Date(`${r.date}T00:00:00+09:00`).getTime() : 0);

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });

  const now = Date.now();
  const w0 = now - 7 * DAY;        // 今週（直近7日）
  const w1 = now - 14 * DAY;       // 先週（8〜14日前）

  try {
    const [roundSnap, userSnap] = await Promise.all([
      db.collection('rounds').limit(1000).get(),
      db.collection('users').limit(1000).get(),
    ]);
    const rounds: Round[] = roundSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
    const users = userSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));

    // ── 北極星：実際にラウンドした人数（完了ラウンドのメンバー・当日欠席は除く） ──
    const playedIn = (from: number, to: number) => {
      const set = new Set<string>();
      for (const r of rounds) {
        if (r.status !== 'completed') continue;
        const t = (r as any).completedAt || dateOf(r) || r.createdAt || 0;
        if (t < from || t >= to) continue;
        const noShow = new Set(r.noShowIds || []);
        for (const m of membersOf(r)) if (!noShow.has(m)) set.add(m);
      }
      return set;
    };
    const playedThis = playedIn(w0, now);
    const playedPrev = playedIn(w1, w0);

    // ── ① 供給：募集を立てた人／うち「初めて立てた人」 ──
    const firstHostAt: Record<string, number> = {};
    for (const r of rounds) {
      const t = r.createdAt || 0;
      if (!r.hostId || !t) continue;
      if (!firstHostAt[r.hostId] || t < firstHostAt[r.hostId]) firstHostAt[r.hostId] = t;
    }
    const createdIn = (from: number, to: number) => rounds.filter((r) => (r.createdAt || 0) >= from && (r.createdAt || 0) < to);
    const newHostsIn = (from: number, to: number) =>
      Object.entries(firstHostAt).filter(([, t]) => t >= from && t < to).length;

    // ── ② 成立：完了ラウンドの充足率（メンバー数 / 定員） ──
    const fillRate = (from: number, to: number) => {
      const done = rounds.filter((r) => {
        const t = (r as any).completedAt || dateOf(r) || 0;
        return r.status === 'completed' && t >= from && t < to;
      });
      if (!done.length) return null;
      const sum = done.reduce((a, r) => a + Math.min(1, membersOf(r).length / Math.max(1, r.maxSpots || 1)), 0);
      return Math.round((sum / done.length) * 100);
    };

    // ── ③ 定着：完了ラウンド経験者のうち、2回以上回った人の割合 ──
    const playCount: Record<string, number> = {};
    for (const r of rounds) {
      if (r.status !== 'completed') continue;
      const noShow = new Set(r.noShowIds || []);
      for (const m of membersOf(r)) if (!noShow.has(m)) playCount[m] = (playCount[m] || 0) + 1;
    }
    const everPlayed = Object.keys(playCount).length;
    const repeat = Object.values(playCount).filter((n) => n >= 2).length;

    // ── 活性化：登録者のうちラウンドに関与した人（主催 or 参加） ──
    const engaged = new Set<string>();
    for (const r of rounds) for (const m of membersOf(r)) engaged.add(m);

    // ── 運用アラート：開催が近いのに埋まっていない募集 ──
    const alerts = rounds
      .filter((r) => r.status === 'open')
      .map((r) => {
        const d = dateOf(r);
        const daysLeft = d ? Math.ceil((d - now) / DAY) : null;
        const joined = (r.applicantIds || []).length + (r.coHostIds || []).length;
        return {
          id: r.id, title: r.title || '(無題)', date: r.date || '未定', daysLeft,
          joined, maxSpots: r.maxSpots || 0,
          empty: joined === 0,
          isCompetition: !!r.isCompetition,
        };
      })
      .filter((a) => a.daysLeft !== null && (a.daysLeft as number) >= 0 && (a.daysLeft as number) <= 21 && a.empty)
      .sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number));

    return NextResponse.json({
      generatedAt: now,
      northStar: { thisWeek: playedThis.size, lastWeek: playedPrev.size },
      supply: {
        roundsThisWeek: createdIn(w0, now).length,
        roundsLastWeek: createdIn(w1, w0).length,
        newHostsThisWeek: newHostsIn(w0, now),
        newHostsLastWeek: newHostsIn(w1, w0),
        totalHosts: Object.keys(firstHostAt).length,
      },
      matching: { fillRateThisWeek: fillRate(w0, now), fillRateAll: fillRate(0, now) },
      retention: { everPlayed, repeat, repeatRate: everPlayed ? Math.round((repeat / everPlayed) * 100) : 0 },
      activation: { totalUsers: users.length, engaged: engaged.size, rate: users.length ? Math.round((engaged.size / users.length) * 100) : 0 },
      alerts,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
