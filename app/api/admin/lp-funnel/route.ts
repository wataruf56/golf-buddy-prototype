import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { isTestId, warmTestIds } from '@/lib/testAccounts';

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
const sz = (s?: Set<string>) => (s ? s.size : 0);

export async function GET(req: NextRequest) {
  // 手動登録したテストアカウントも外すため、最初に1回だけ読み込む。
  await warmTestIds();
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

    // 自動ブラウザ（開発時の動作確認・クローラ）を除外する。
    // Playwright/Puppeteer は UA に HeadlessChrome を含むので、それで判別できる。
    // 除外した人数は botExcluded として返し、何を落としたか分かるようにする。
    const isBot = (ua: string) => /HeadlessChrome|Headless|bot|spider|crawler|Lighthouse|Chrome-Lighthouse/i.test(ua);
    const botVisitors = new Set<string>();
    docs.forEach((d) => { if (isBot(String(d.ua || ''))) botVisitors.add(String(d.visitorId || '')); });
    // 同じ visitorId のイベントは丸ごと落とす（一部だけ残ると人数が合わなくなる）
    docs = docs.filter((d) => !botVisitors.has(String(d.visitorId || '')));

    // UAごとの内訳（混入の確認用）。人数のみ。
    const uaAgg: Record<string, Set<string>> = {};
    docs.forEach((d) => {
      const ua = String(d.ua || '');
      const key = /iPhone|iPad/i.test(ua) ? 'iPhone/iPad'
        : /Android/i.test(ua) ? 'Android'
        : /Macintosh/i.test(ua) ? 'Mac'
        : /Windows/i.test(ua) ? 'Windows'
        : ua ? 'その他' : '(不明)';
      (uaAgg[key] = uaAgg[key] || new Set()).add(String(d.visitorId || ''));
    });

    // ── ステップごとのユニーク訪問者 ──
    const STEPS = ['view', 'd25', 'd50', 'd75', 'd100', 'click', 'goal'] as const;
    type StepKey = typeof STEPS[number];
    const mk = () => ({ view: new Set<string>(), d25: new Set<string>(), d50: new Set<string>(), d75: new Set<string>(), d100: new Set<string>(), click: new Set<string>(), goal: new Set<string>() });

    const all = mk();
    const byEntry: Record<string, ReturnType<typeof mk>> = {};
    const byPage: Record<string, ReturnType<typeof mk>> = {};
    // A/Bテスト（a=現行 / b=新案）の比較。割り当ては visitorId 由来で固定。
    const byVariant: Record<string, ReturnType<typeof mk>> = {};
    // LINEへ飛んだ後の段階別。入口（どのLPから来たか）ごとにも分ける。
    const liffSteps: Record<string, Set<string>> = {};
    const liffByEntry: Record<string, Record<string, Set<string>>> = {};
    // 出発したLP別（top=普通のLP / mbti=診断LP / links=リンクハブ / line=LINE内から直接）
    //
    // 1人を1つのLPにだけ数える。同じ人がLPから1回・リッチメニューから1回開くと
    // 両方に入ってしまい、LP別の合計が全体を上回っていた（実際に open で
    // 39 vs 34 のズレが出ていた）。**その人が最初に来たLP**に寄せて数える。
    const liffByLp: Record<string, Record<string, Set<string>>> = {};
    const firstLpOf: Record<string, { lp: string; ts: number }> = {};
    for (const d of docs) {
      if (d.event !== 'step') continue;
      const vid = String(d.visitorId || ''); if (!vid) continue;
      const ts = Number(d.ts || 0);
      const lp = String(d.fromLp || '') || 'line';
      const cur = firstLpOf[vid];
      if (!cur || ts < cur.ts) firstLpOf[vid] = { lp, ts };
    }
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
      } else if (d.event === 'step') {
        const st = String(d.step || '');
        if (st) {
          (liffSteps[st] = liffSteps[st] || new Set()).add(vid);
          const be = (liffByEntry[entry] = liffByEntry[entry] || {});
          (be[st] = be[st] || new Set()).add(vid);
          const lp = firstLpOf[vid]?.lp || String(d.fromLp || '') || 'line';
          const bl = (liffByLp[lp] = liffByLp[lp] || {});
          (bl[st] = bl[st] || new Set()).add(vid);
        }
      } else if (d.event === 'exit') {
        if (typeof d.dwellMs === 'number' && d.dwellMs > 0 && d.dwellMs < 3600000) { dwellSum += d.dwellMs; dwellN++; }
        if (typeof d.maxScroll === 'number') {
          scrollSum += d.maxScroll; scrollN++;
          if (!maxScrollOf[vid] || d.maxScroll > maxScrollOf[vid]) maxScrollOf[vid] = d.maxScroll;
        }
      }
    }

    // --- サーバー側の実測：期間内に実際に作られた会員 ---
    // クライアント計測（liff_new）と突き合わせるための「答え」。
    // acquisitionAt が無い古いユーザーは createdAt で拾う。
    //
    // 注意点が2つある。
    //  ① test_ で始まるアカウントは動作確認用。会員数に混ぜない（実際に11件あり、
    //     54人と出ていたうちの11人がこれだった）。
    //  ② 画面計測（liff_new）は 2026-08-21 に入れたもので、それ以前の登録は
    //     どうやっても数えられない。全期間の実測と並べると「大きくズレている」
    //     ように見えるだけなので、**計測開始以降**の実測も一緒に返して、
    //     同じ土俵で比べられるようにする。
    const signups = {
      total: 0,                     // 実ユーザーのみ（test_ を除く）
      testExcluded: 0,
      byEntry: [] as { entry: string; n: number }[],
      missingAt: 0,
      sinceTracking: { from: 0, n: 0 },
    };

    // 画面計測（LIFFの段階）がいつから貯まっているか
    let trackFrom = 0;
    try {
      const tSnap = await db.collection('_lpTrack').where('event', '==', 'step')
        .orderBy('ts', 'asc').limit(1).get();
      if (!tSnap.empty) trackFrom = Number(tSnap.docs[0].data()?.ts || 0);
    } catch {
      const steps = docs.filter((d) => d.event === 'step').map((d) => Number(d.ts || 0)).filter(Boolean);
      if (steps.length) trackFrom = Math.min(...steps);
    }
    signups.sinceTracking.from = Math.max(trackFrom, from);

    try {
      const usnap = await db.collection('users').limit(5000).get();
      const bySrc: Record<string, number> = {};
      usnap.docs.forEach((u: any) => {
        const x = u.data() || {};
        const id = String(x.id || u.id || '');
        const at = Number(x.acquisitionAt || x.createdAt || 0);
        if (isTestId(id)) {
          if (at >= from && at < to) signups.testExcluded++;
          return;
        }
        if (!at) { signups.missingAt++; return; }
        if (at < from || at >= to) return;
        signups.total++;
        const tracked = !!trackFrom && at >= signups.sinceTracking.from;
        if (tracked) signups.sinceTracking.n++;
        // 流入経路の記録を入れる前に登録した人は、あとから調べようがない。
        // 'unknown'（＝記録したが分からなかった）と混ぜず、'_pre' として分けておく。
        // 混ぜると「計測が効いていない」のか「昔の人」なのかが判別できなくなる。
        const src = tracked
          ? (String(x.acquisitionSource || 'unknown').toLowerCase() || 'unknown')
          : '_pre';
        bySrc[src] = (bySrc[src] || 0) + 1;
      });
      signups.byEntry = Object.entries(bySrc).map(([entry, n]) => ({ entry, n })).sort((a, b) => b.n - a.n);
    } catch { /* 取れなくてもファネルは返す */ }

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
      // 自動ブラウザとして除外した人数（開発時の動作確認など）
      botExcluded: botVisitors.size,
      byDevice: Object.entries(uaAgg).map(([k, v]) => ({ key: k, users: v.size })).sort((a, b) => b.users - a.users),
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
      // LINE遷移後のファネル（どこで落ちているか）。
      // signup は旧イベント名（新規/既存を区別していなかった）。互換のため残すが、
      // 「登録完了」として読むべきなのは newUser の方。
      liffFunnel: {
        open: sz(liffSteps['liff_open']),
        sdk: sz(liffSteps['liff_sdk']),
        login: sz(liffSteps['liff_login']),
        back: sz(liffSteps['liff_back']),
        auth: sz(liffSteps['liff_auth']),
        newUser: sz(liffSteps['liff_new']),
        returning: sz(liffSteps['liff_return']),
        signup: sz(liffSteps['liff_signup']),   // 旧イベント（新規＋既存の合算）
        error: sz(liffSteps['liff_error']),
      },
      // 画面計測（LIFFの段階）が貯まり始めた時刻。これ以前の登録は計測できない。
      trackFrom,
      // 「LPから飛んできた人」と「LINEの中から直接開いた人」を分ける。
      //
      // ひとつのファネルに混ぜると、LPで押した人(11) より 起動した人(34) の方が
      // 多くなって話が通らない。34人のうち大半は**リッチメニューなどLINEの中から
      // 開いた人**で、LPを通っていないため。別々に見せる。
      liffOrigin: (() => {
        const KEYS = ['liff_open', 'liff_login', 'liff_back', 'liff_auth', 'liff_new', 'liff_return', 'liff_error'] as const;
        const pick = (want: 'lp' | 'line') => {
          const o: Record<string, number> = {};
          for (const k of KEYS) {
            const set = new Set<string>();
            for (const [lp, m] of Object.entries(liffByLp)) {
              if ((want === 'line') !== (lp === 'line')) continue;
              (m[k] || new Set<string>()).forEach((v) => set.add(v));
            }
            o[k] = set.size;
          }
          return {
            open: o.liff_open, login: o.liff_login, back: o.liff_back, auth: o.liff_auth,
            newUser: o.liff_new, returning: o.liff_return, error: o.liff_error,
          };
        };
        return { fromLp: pick('lp'), fromLine: pick('line') };
      })(),
      liffByLp: Object.entries(liffByLp)
        .map(([lp, m]) => ({
          lp,
          open: sz(m['liff_open']), login: sz(m['liff_login']), back: sz(m['liff_back']),
          auth: sz(m['liff_auth']), newUser: sz(m['liff_new']), returning: sz(m['liff_return']),
          signup: sz(m['liff_signup']), error: sz(m['liff_error']),
        }))
        .sort((a, b) => b.open - a.open),
      liffByEntry: Object.entries(liffByEntry)
        .map(([entry, m]) => ({
          entry,
          open: sz(m['liff_open']), login: sz(m['liff_login']), back: sz(m['liff_back']),
          auth: sz(m['liff_auth']), newUser: sz(m['liff_new']), returning: sz(m['liff_return']),
          signup: sz(m['liff_signup']), error: sz(m['liff_error']),
        }))
        .sort((a, b) => b.open - a.open),
      // サーバー側の実測（＝答え合わせ）。クライアント計測が漏れても、
      // 実際に会員ドキュメントが作られた数はここで必ず分かる。
      signups,
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
