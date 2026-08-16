import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理画面：LP流入ファネル。_lpTrack を集計する。
//
// 数え方はすべて **ユニーク（visitorId 基準）**。同じ人が何回スクロールしても1人。
// 「どの入口から来た人が、どこまで進んで、どこで落ちたか」を1本で見るのが目的。
//
// ステップ（この順に絞り込まれる）
//   1. 到達        view
//   2. 25%まで見た  scroll depth>=25
//   3. 50%まで見た  scroll depth>=50
//   4. 75%まで見た  scroll depth>=75
//   5. 最後まで見た scroll depth=100
//   6. ボタンを押した click
//   7. LINEへ進んだ goal   ← 最終ゴール
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const DAY = 86400000;

function authed(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

type Row = Record<string, any>;
const uniq = (s: Set<string>) => s.size;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const url = new URL(req.url);
  const pageFilter = url.searchParams.get('page') || '';   // top / mbti / links / rounds / ''(すべて)

  // 期間の指定。?from=YYYY-MM-DD&to=YYYY-MM-DD（JSTの日付）が優先。
  // 無ければ ?days=N（既定30日）。境界はJSTの0:00と翌0:00。
  const JST = 9 * 3600 * 1000;
  const dayStart = (ymd: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
    const t = Date.parse(`${ymd}T00:00:00+09:00`);
    return isFinite(t) ? t : null;
  };
  const fromParam = dayStart(url.searchParams.get('from') || '');
  const toParam = dayStart(url.searchParams.get('to') || '');
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days') || 30)));
  const from = fromParam ?? (Date.now() - days * DAY);
  const to = toParam != null ? toParam + DAY : Number.MAX_SAFE_INTEGER;   // 終了日はその日いっぱい

  try {
    let docs: Row[] = [];
    try {
      const snap = await db.collection('_lpTrack').where('ts', '>=', from).orderBy('ts', 'desc').limit(30000).get();
      docs = snap.docs.map((d: any) => d.data() || {});
    } catch {
      // 複合インデックスが無い環境向けフォールバック
      const snap = await db.collection('_lpTrack').orderBy('ts', 'desc').limit(30000).get();
      docs = snap.docs.map((d: any) => d.data() || {}).filter((x: Row) => (x.ts || 0) >= from);
    }
    if (to !== Number.MAX_SAFE_INTEGER) docs = docs.filter((d) => (d.ts || 0) < to);
    if (pageFilter) docs = docs.filter((d) => d.page === pageFilter);
    // 疎通確認用の送信（visitorId が vtest_ で始まるもの）は数字に混ぜない。
    docs = docs.filter((d) => !String(d.visitorId || '').startsWith('vtest_'));

    // ── ステップごとのユニーク訪問者 ──
    const STEPS = ['view', 'd25', 'd50', 'd75', 'd100', 'click', 'goal'] as const;
    type StepKey = typeof STEPS[number];
    const mk = () => ({ view: new Set<string>(), d25: new Set<string>(), d50: new Set<string>(), d75: new Set<string>(), d100: new Set<string>(), click: new Set<string>(), goal: new Set<string>() });

    const all = mk();
    const byEntry: Record<string, ReturnType<typeof mk>> = {};
    const byPage: Record<string, ReturnType<typeof mk>> = {};
    // A/Bテスト（a=現行 / b=新案）の比較。割り当ては visitorId 由来で固定。
    const byVariant: Record<string, ReturnType<typeof mk>> = {};
    const clickTargets: Record<string, Set<string>> = {};
    const goalTargets: Record<string, Set<string>> = {};
    const sessions = new Set<string>();
    const newV = new Set<string>(), retV = new Set<string>();
    const mobileV = new Set<string>(), desktopV = new Set<string>();
    const dailyV: Record<string, Set<string>> = {};
    const dailyGoal: Record<string, Set<string>> = {};
    const hourV: number[] = Array(24).fill(0);
    let dwellSum = 0, dwellN = 0, scrollSum = 0, scrollN = 0;
    const maxScrollOf: Record<string, number> = {};

    const addTo = (bucket: ReturnType<typeof mk>, key: StepKey, vid: string) => { if (vid) bucket[key].add(vid); };

    for (const d of docs) {
      const vid = String(d.visitorId || '');
      if (!vid) continue;
      const entry = String(d.entry || 'direct');
      const page = String(d.page || 'top');
      byEntry[entry] = byEntry[entry] || mk();
      byPage[page] = byPage[page] || mk();
      const variant = String(d.variant || '');
      if (variant) byVariant[variant] = byVariant[variant] || mk();
      if (d.sessionId) sessions.add(String(d.sessionId));

      const mark = (k: StepKey) => { addTo(all, k, vid); addTo(byEntry[entry], k, vid); addTo(byPage[page], k, vid); if (variant) addTo(byVariant[variant], k, vid); };

      if (d.event === 'view') {
        mark('view');
        if (d.returning) retV.add(vid); else newV.add(vid);
        if (d.isMobile) mobileV.add(vid); else desktopV.add(vid);
        const day = new Date((d.ts || 0) + 9 * 3600000).toISOString().slice(0, 10);
        (dailyV[day] = dailyV[day] || new Set()).add(vid);
        try { hourV[new Date((d.ts || 0) + 9 * 3600000).getUTCHours()]++; } catch { /* noop */ }
      } else if (d.event === 'scroll') {
        const dep = Number(d.depth || 0);
        if (dep >= 25) mark('d25');
        if (dep >= 50) mark('d50');
        if (dep >= 75) mark('d75');
        if (dep >= 100) mark('d100');
      } else if (d.event === 'click') {
        mark('click');
        const t = String(d.target || 'unknown');
        (clickTargets[t] = clickTargets[t] || new Set()).add(vid);
      } else if (d.event === 'goal') {
        mark('goal');
        const t = String(d.target || 'unknown');
        (goalTargets[t] = goalTargets[t] || new Set()).add(vid);
        const day = new Date((d.ts || 0) + 9 * 3600000).toISOString().slice(0, 10);
        (dailyGoal[day] = dailyGoal[day] || new Set()).add(vid);
      } else if (d.event === 'exit') {
        if (typeof d.dwellMs === 'number' && d.dwellMs > 0 && d.dwellMs < 3600000) { dwellSum += d.dwellMs; dwellN++; }
        if (typeof d.maxScroll === 'number') {
          scrollSum += d.maxScroll; scrollN++;
          if (!maxScrollOf[vid] || d.maxScroll > maxScrollOf[vid]) maxScrollOf[vid] = d.maxScroll;
        }
      }
    }

    const toFunnel = (b: ReturnType<typeof mk>) => ({
      view: uniq(b.view), d25: uniq(b.d25), d50: uniq(b.d50), d75: uniq(b.d75),
      d100: uniq(b.d100), click: uniq(b.click), goal: uniq(b.goal),
    });

    const funnel = toFunnel(all);
    const visitors = funnel.view;

    // 直帰＝到達したが25%も見ずに終わった人
    const bounced = Math.max(0, visitors - funnel.d25);

    // 離脱が一番大きいステップ（＝改善すべき場所）
    const seq: Array<{ key: string; label: string; n: number }> = [
      { key: 'view', label: 'LPに到達', n: funnel.view },
      { key: 'd25', label: '25%まで読んだ', n: funnel.d25 },
      { key: 'd50', label: '50%まで読んだ', n: funnel.d50 },
      { key: 'd75', label: '75%まで読んだ', n: funnel.d75 },
      { key: 'd100', label: '最後まで読んだ', n: funnel.d100 },
      { key: 'click', label: 'ボタンを押した', n: funnel.click },
      { key: 'goal', label: 'LINEへ進んだ', n: funnel.goal },
    ];
    let worst: { from: string; to: string; lost: number; rate: number } | null = null;
    for (let i = 1; i < seq.length; i++) {
      const lost = seq[i - 1].n - seq[i].n;
      const rate = seq[i - 1].n ? Math.round((lost / seq[i - 1].n) * 100) : 0;
      if (lost > 0 && (!worst || lost > worst.lost)) worst = { from: seq[i - 1].label, to: seq[i].label, lost, rate };
    }

    const sortSet = (o: Record<string, Set<string>>) =>
      Object.entries(o).map(([k, v]) => ({ key: k, users: v.size })).sort((a, b) => b.users - a.users);

    // A/Bテストがいつから動いているか（variant を持つ最古のイベント）。
    // 期間で切られていても分かるよう、期間フィルタの前の全体から探す。
    let abStartedAt = 0;
    try {
      const abSnap = await db.collection('_lpTrack').where('variant', 'in', ['a', 'b'])
        .orderBy('ts', 'asc').limit(1).get();
      if (!abSnap.empty) abStartedAt = Number(abSnap.docs[0].data()?.ts || 0);
    } catch {
      // インデックスが無い場合は、いま集計した中の最古で代用
      const withV = docs.filter((d) => d.variant === 'a' || d.variant === 'b');
      if (withV.length) abStartedAt = Math.min(...withV.map((d) => Number(d.ts || 0)));
    }

    // 実際に集計に入ったイベントの範囲（画面に「いつからいつまで」を出すため）
    const tsList = docs.map((d) => Number(d.ts || 0)).filter(Boolean);
    const dataFrom = tsList.length ? Math.min(...tsList) : 0;
    const dataTo = tsList.length ? Math.max(...tsList) : 0;

    return NextResponse.json({
      generatedAt: Date.now(),
      range: {
        days, from,
        to: to === Number.MAX_SAFE_INTEGER ? null : to,
        fromYmd: url.searchParams.get('from') || '',
        toYmd: url.searchParams.get('to') || '',
        dataFrom, dataTo,
      },
      abStartedAt,
      scanned: docs.length,
      // ── ビジネスの基本指標（すべてユニーク） ──
      kpi: {
        visitors,                                                   // UU
        sessions: sessions.size,
        goals: funnel.goal,
        cvr: visitors ? Math.round((funnel.goal / visitors) * 1000) / 10 : 0,   // %
        bounced,
        bounceRate: visitors ? Math.round((bounced / visitors) * 1000) / 10 : 0,
        readThroughRate: visitors ? Math.round((funnel.d100 / visitors) * 1000) / 10 : 0,
        ctr: visitors ? Math.round((funnel.click / visitors) * 1000) / 10 : 0,
        avgDwellSec: dwellN ? Math.round(dwellSum / dwellN / 1000) : 0,
        avgMaxScroll: scrollN ? Math.round(scrollSum / scrollN) : 0,
        newVisitors: newV.size,
        returningVisitors: retV.size,
        mobile: mobileV.size,
        desktop: desktopV.size,
      },
      funnel: seq,
      worstDrop: worst,
      byEntry: Object.entries(byEntry)
        .map(([entry, b]) => ({ entry, ...toFunnel(b) }))
        .sort((a, b) => b.view - a.view),
      byPage: Object.entries(byPage)
        .map(([page, b]) => ({ page, ...toFunnel(b) }))
        .sort((a, b) => b.view - a.view),
      byVariant: Object.entries(byVariant)
        .map(([variant, b]) => ({ variant, ...toFunnel(b) }))
        .sort((a, b) => a.variant.localeCompare(b.variant)),
      clickTargets: sortSet(clickTargets),
      goalTargets: sortSet(goalTargets),
      daily: Object.keys(dailyV).sort().map((date) => ({
        date, visitors: dailyV[date].size, goals: (dailyGoal[date] || new Set()).size,
      })),
      byHour: hourV,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
