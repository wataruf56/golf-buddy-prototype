import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { warmTestIds, isTestId } from '@/lib/testAccounts';


const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const DAY = 24 * 60 * 60 * 1000;

// 動的セグメント（ID）をまとめて、画面種別ごとに集計できるよう正規化する。
function normPage(raw: string): string {
  let p = String(raw || '').split('?')[0];
  if (!p) return '(不明)';
  p = p
    .replace(/^\/round\/[^/]+\/chat$/, '/round/[id]/chat')
    .replace(/^\/round\/[^/]+\/edit$/, '/round/[id]/edit')
    .replace(/^\/round\/[^/]+$/, '/round/[id]')
    .replace(/^\/profile\/[^/]+$/, '/profile/[id]')
    .replace(/^\/chat\/[^/]+$/, '/chat/[id]')
    .replace(/^\/poll\/[^/]+$/, '/poll/[id]')
    .replace(/^\/rematch\/[^/]+$/, '/rematch/[id]')
    .replace(/^\/swing\/[^/]+$/, '/swing/[id]');
  return p || '/';
}

// GET /api/admin/activity?token=XXX
// Activity report for the admin: who's opening the app, who's tapping around,
// and who's using swing analysis (and how many times). Aggregated from the
// _logs (client telemetry) and swings collections.
export async function GET(req: NextRequest) {
  // 手動登録したテストアカウントも外すため、最初に1回だけ読み込む。
  await warmTestIds();
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const now = Date.now();
  try {
    // --- 1+2) Activity from client telemetry ---
    // page_view が大量に混ざるため広めに取得。①が参照する操作が②に必ず含まれるよう、
    // ②の表示件数も十分に増やして（下記 slice）窓を揃える。
    const logSnap = await db.collection('_logs').orderBy('ts', 'desc').limit(4000).get();
    // 動作確認用（test_）の操作は実績に混ぜない。混ざると「よく開かれている画面」や
    // アクティブユーザー数が、実際に使われているより多く見えてしまう。
    // 動作確認用（test_・手動登録ぶん）は実績に混ぜない。混ざると「よく開かれている画面」や
    // アクティブユーザー数が、実際に使われているより多く見えてしまう。
    // **相手がテストの操作も落とす**。実ユーザーがテスト垢にDMを開いた記録などは、
    // 本人の行動ではあってもテストの副産物なので、操作ログに並べても読む意味がない。
    const logs = logSnap.docs.map((d: any) => d.data()).filter((l: any) => {
      if (isTestId(l?.userId)) return false;
      const to = (l?.data && typeof l.data.to === 'string') ? l.data.to : '';
      if (to && isTestId(to)) return false;
      // プロフィール閲覧は URL の末尾が相手のID
      const m = String(l?.page || '').match(/^\/profile\/([^/?#]+)/);
      if (m && isTestId(decodeURIComponent(m[1]))) return false;
      return true;
    });

    // ①いま使っているユーザーの「最後の操作」は実操作のみ（画面表示は除く）。
    const ACTION_HIDDEN = new Set(['app_open', 'hydrate_success', 'hydrate_error', 'page_view', 'mypage_render', 'menu_entry']);
    // ②直近の操作ログは「画面（タブ）を開いた」も残す（アプリ起動系だけ除外）。
    // profile_edit_initialized は page_view /mypage/edit と毎回2重になり操作ログを埋めるため非表示
    // （編集画面を開いた事実は page_view 行で追える）。
    const LOG_HIDDEN = new Set(['app_open', 'hydrate_success', 'hydrate_error', 'mypage_render', 'menu_entry', 'profile_edit_initialized']);

    // Per-user rollup。lastTs=最後の活動(閲覧含む)、lastActionTs=最後の“操作”(②に出るもの)。
    const perUser: Record<string, {
      count: number; lastTs: number; lastPage: string;
      lastActionTs: number; lastActionEvent: string; lastActionPage: string;
    }> = {};
    for (const l of logs) {
      const uid = l.userId;
      if (!uid) continue;
      if (!perUser[uid]) perUser[uid] = { count: 0, lastTs: 0, lastPage: '', lastActionTs: 0, lastActionEvent: '', lastActionPage: '' };
      perUser[uid].count++;
      if ((l.ts || 0) > perUser[uid].lastTs) {
        perUser[uid].lastTs = l.ts || 0;
        perUser[uid].lastPage = l.page || '';
        // 「誰に対して」の相手ID（DMの宛先・閲覧したプロフィールの本人）。①でも名前を出すため。
        (perUser[uid] as any).lastTo = (l?.data && typeof l.data.to === 'string' && l.data.to)
          || (String(l.page || '').startsWith('/profile/')
              ? decodeURIComponent(String(l.page).split('?')[0].split('/').pop() || '') : '');
      }
      // 最後の「操作」（②直近の操作ログに出るのと同じ種類）を別途保持。
      if (l.event && !ACTION_HIDDEN.has(l.event) && (l.ts || 0) > perUser[uid].lastActionTs) {
        perUser[uid].lastActionTs = l.ts || 0;
        perUser[uid].lastActionEvent = l.event;
        perUser[uid].lastActionPage = l.page || '';
      }
    }

    // Recent raw actions（直近の操作ログ）。「アプリを開いた／アプリ起動／画面表示」系は
    // ノイズなので除外して、実際の操作だけを見やすく並べる。
    // ①いま使っているユーザーが参照する“最後の操作”を確実に含めるため、取得した窓内の
    // 操作は基本すべて出す（上限は表示保護として大きめ）。これで①と②が食い違わない。
    const recentActions = logs
      .filter((l: any) => l.event && !LOG_HIDDEN.has(l.event))
      .slice(0, 1500)   // ①のユーザーごとの操作ログをここから引くため広めに保持
      .map((l: any) => {
        const pageNorm = normPage(l.page || '');
        // 「誰に対して」の相手ID。DM(dm_open/dm_send)は data.to、
        // 他の人のプロフィール閲覧(page_view /profile/[id])はパス末尾のユーザーIDから取る。
        let to = (l?.data && typeof l.data.to === 'string') ? l.data.to : '';
        if (!to && l.event === 'page_view' && pageNorm === '/profile/[id]') {
          try { to = decodeURIComponent(String(l.page || '').split('?')[0].split('/').pop() || ''); } catch { /* noop */ }
        }
        return { userId: l.userId, event: l.event, page: l.page, pageNorm, ts: l.ts, to };
      });

    // リッチメニューからの入口（?e= を付けたリンク経由の menu_entry を集計）。
    let menuEntries: Array<{ menu: string; count: number }> = [];
    try {
      const meSnap = await db.collection('_logs').where('event', '==', 'menu_entry').limit(3000).get();
      const byMenu: Record<string, number> = {};
      meSnap.docs.forEach((d: any) => {
        const menu = String(d.data()?.data?.menu || 'unknown').slice(0, 40);
        byMenu[menu] = (byMenu[menu] || 0) + 1;
      });
      menuEntries = Object.entries(byMenu).map(([menu, count]) => ({ menu, count })).sort((a, b) => b.count - a.count);
    } catch { /* index無し等でも致命的でない */ }

    // 人気の画面：直近でユーザーがよく開いている画面（page_view を集計）。
    // ID付きの動的画面はまとめる。直近7日ぶんに絞る。
    const pageAgg: Record<string, { views: number; users: Set<string>; lastTs: number }> = {};
    for (const l of logs) {
      if (l.event !== 'page_view' || !l.page) continue;
      if (now - (l.ts || 0) > 7 * DAY) continue;
      const p = normPage(l.page);
      if (!pageAgg[p]) pageAgg[p] = { views: 0, users: new Set(), lastTs: 0 };
      pageAgg[p].views++;
      if (l.userId) pageAgg[p].users.add(l.userId);
      if ((l.ts || 0) > pageAgg[p].lastTs) pageAgg[p].lastTs = l.ts || 0;
    }
    const popularPages = Object.entries(pageAgg)
      .map(([page, v]) => ({ page, views: v.views, users: v.users.size, lastTs: v.lastTs }))
      .sort((a, b) => b.views - a.views || b.users - a.users)
      .slice(0, 30);

    // --- 3+4) Swing analysis usage ---
    let swings: any[] = [];
    try {
      const swSnap = await db.collection('swings').orderBy('createdAt', 'desc').limit(500).get();
      swings = swSnap.docs.map((d: any) => d.data()).filter((x: any) => !isTestId(x?.userId));
    } catch {
      // Fallback without orderBy (older docs missing createdAt index)
      const swSnap = await db.collection('swings').limit(500).get();
      swings = swSnap.docs.map((d: any) => d.data()).filter((x: any) => !isTestId(x?.userId));
      swings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    const swingPerUser: Record<string, { total: number; done: number; lastAt: number }> = {};
    for (const s of swings) {
      const uid = s.userId;
      if (!uid) continue;
      if (!swingPerUser[uid]) swingPerUser[uid] = { total: 0, done: 0, lastAt: 0 };
      swingPerUser[uid].total++;
      if (s.status === 'done') swingPerUser[uid].done++;
      if ((s.createdAt || 0) > swingPerUser[uid].lastAt) swingPerUser[uid].lastAt = s.createdAt || 0;
    }

    // --- Resolve display names for every referenced user ---
    // 「操作した人」だけでなく「操作の相手」(DMの宛先・閲覧されたプロフィールの本人)も
    // 名前解決の対象に含める。含めないと管理画面で「→ (未登録)」になってしまう。
    // 再会エンジンのURLは /rematch/{userA}__{userB} で、**相手のIDがパスに入っている**。
    // 名前解決の対象に入れておかないと、画面に生のIDが並ぶ（実際そうなっていた）。
    const pairIdsIn = (page: string): string[] => {
      const m = String(page || '').split('?')[0].match(/^\/rematch\/([^/]+)/);
      if (!m) return [];
      let raw = m[1];
      try { raw = decodeURIComponent(raw); } catch { /* そのまま */ }
      return raw.split('__').filter(Boolean);
    };
    const ids = Array.from(new Set([
      ...Object.keys(perUser),
      ...Object.keys(swingPerUser),
      ...recentActions.map((a: any) => a.to).filter(Boolean),
      ...Object.values(perUser).map((v: any) => v.lastTo).filter(Boolean),
      ...recentActions.flatMap((a: any) => pairIdsIn(a.page)),
      ...Object.values(perUser).flatMap((v: any) => pairIdsIn(v.lastPage || '')),
    ]));
    const names: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      if (!chunk.length) continue;
      const us = await db.collection('users').where('__name__', 'in', chunk).get();
      us.docs.forEach((d: any) => { names[d.id] = d.data().displayName || ''; });
    }
    const nameOf = (id: string) => names[id] || '(未登録)';

    // --- ラウンド名の解決 ---
    // 「ラウンド詳細を開いた」だけだと何の募集か分からないので、パスのIDから
    // タイトルを引く。プロフィール閲覧で相手の名前を出しているのと同じ扱い。
    // 対象は /round/[id]（詳細・チャット・編集）と /poll/[id]（日程調整）。
    const roundIdOf = (page: string): string => {
      const m = String(page || '').split('?')[0].match(/^\/(?:round|poll)\/([^/]+)/);
      try { return m ? decodeURIComponent(m[1]) : ''; } catch { return m ? m[1] : ''; }
    };
    const roundIds = Array.from(new Set([
      ...recentActions.map((a: any) => roundIdOf(a.page)),
      ...Object.values(perUser).map((v: any) => roundIdOf(v.lastPage)),
    ].filter(Boolean)));
    const roundTitles: Record<string, string> = {};
    for (let i = 0; i < roundIds.length; i += 30) {
      const chunk = roundIds.slice(i, i + 30);
      if (!chunk.length) continue;
      try {
        const rs = await db.collection('rounds').where('__name__', 'in', chunk).get();
        rs.docs.forEach((d: any) => {
          const r = d.data() || {};
          const t = String(r.title || '').trim();
          const date = String(r.date || '').slice(5).replace('-', '/');
          roundTitles[d.id] = [t || '（無題の募集）', date].filter(Boolean).join(' ');
        });
      } catch { /* 日程調整など rounds に無いIDは無視 */ }
    }
    const roundTitleOf = (page: string) => roundTitles[roundIdOf(page)] || '';

    // 「誰との再会か」。見ている本人を除いた**相手の名前**を返す。
    // 本人がペアに含まれないとき（管理者が覗いた等）は両方の名前を出す。
    const rematchWith = (page: string, viewerId: string): string => {
      const [a, b] = pairIdsIn(page);
      if (!a || !b) return '';
      if (viewerId === a) return nameOf(b);
      if (viewerId === b) return nameOf(a);
      return `${nameOf(a)} ↔ ${nameOf(b)}`;
    };

    // --- Assemble ---
    const activeUsers = Object.entries(perUser)
      .map(([id, v]) => ({ userId: id, name: nameOf(id), ...v, lastPageNorm: normPage(v.lastPage || ''),
        lastToName: (v as any).lastTo ? nameOf((v as any).lastTo) : '',
        lastRoundTitle: roundTitleOf(v.lastPage || ''),
        lastRematchWith: rematchWith(v.lastPage || '', id) }))
      .sort((a, b) => b.lastTs - a.lastTs);
    const active24h = activeUsers.filter((u) => now - u.lastTs <= DAY).length;
    const active7d = activeUsers.filter((u) => now - u.lastTs <= 7 * DAY).length;

    const swingUsers = Object.entries(swingPerUser)
      .map(([id, v]) => ({ userId: id, name: nameOf(id), ...v }))
      .sort((a, b) => b.total - a.total);

    const recentSwings = swings.slice(0, 40).map((s: any) => ({
      userId: s.userId, name: nameOf(s.userId), mode: s.mode, status: s.status, createdAt: s.createdAt,
    }));

    // --- 流入経路（登録ユーザーを acquisitionSource で集計）---
    // 投稿ごとにタグを変える運用（ig_bosyu / ig_story 等）をすると生タグのままでは
    // 行が散らばって「Instagram全体で何人か」が読めなくなる。そこで接頭辞で
    // チャネルにまとめ、チャネル合計と内訳タグの両方を返す。
    let acquisition: {
      total: number; tagged: number;
      bySource: Array<{ source: string; count: number }>;
      byChannel: Array<{ channel: string; count: number; tags: Array<{ source: string; count: number }> }>;
    } = { total: 0, tagged: 0, bySource: [], byChannel: [] };
    try {
      const uSnap = await db.collection('users').limit(3000).get();
      const bySrc: Record<string, number> = {};
      let total = 0, tagged = 0;
      uSnap.docs.forEach((d: any) => {
        const u = d.data() || {};
        if (u.isSystem) return;       // 管理人などは除外
        if (isTestId(d.id)) return;   // 動作確認用は会員数に混ぜない
        total++;
        const src = String(u.acquisitionSource || 'unknown');
        bySrc[src] = (bySrc[src] || 0) + 1;
        if (src && src !== 'unknown') tagged++;
      });

      // 生タグ → チャネル。ig_bosyu / ig_story / instagram はすべて instagram に寄せる。
      const channelOf = (src: string): string => {
        const s = src.toLowerCase();
        const rules: Array<[string, RegExp]> = [
          ['instagram', /^(instagram|insta|ig)(_|$)/],
          ['x',         /^(x|twitter|tw)(_|$)/],
          ['tiktok',    /^(tiktok|tt)(_|$)/],
          ['youtube',   /^(youtube|yt)(_|$)/],
          ['line',      /^line(_|$)/],
          ['flyer',     /^(flyer|qr|chirashi)(_|$)/],
          ['friend',    /^(friend|shokai)(_|$)/],
          ['google',    /^(google|g)(_|$)/],
          ['web',       /^(web|hp|site)(_|$)/],
        ];
        for (const [ch, re] of rules) if (re.test(s)) return ch;
        return s === 'unknown' ? 'unknown' : s;
      };

      const chMap: Record<string, { count: number; tags: Record<string, number> }> = {};
      Object.entries(bySrc).forEach(([source, count]) => {
        const ch = channelOf(source);
        if (!chMap[ch]) chMap[ch] = { count: 0, tags: {} };
        chMap[ch].count += count;
        chMap[ch].tags[source] = (chMap[ch].tags[source] || 0) + count;
      });

      acquisition = {
        total,
        tagged,
        bySource: Object.entries(bySrc).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        byChannel: Object.entries(chMap)
          .map(([channel, v]) => ({
            channel,
            count: v.count,
            tags: Object.entries(v.tags).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
          }))
          // 「不明」は情報量が薄いので、件数が多くても最後に置く。
          .sort((a, b) => (a.channel === 'unknown' ? 1 : b.channel === 'unknown' ? -1 : b.count - a.count)),
      };
    } catch { /* best-effort */ }

    // --- 上部KPI：事業のボトルネックが見える4つ ---
    // ①今月ラウンドした人（＝価値が実際に届いた人。当日欠席は除く）
    // ②今月の募集数／立てた主催者の人数（＝供給。ここが最大のボトルネック）
    // ③募集の満員率（＝立てれば埋まるかどうか。主催を促す根拠）
    // ④30日以内に利用した人（＝生きているユーザー）
    let kpi = { monthPlayers: 0, monthRounds: 0, monthHosts: 0, fillRate: 0, active30d: 0 };
    try {
      const jst = new Date(now + 9 * 3600 * 1000);
      const monthStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - 9 * 3600 * 1000;
      const rSnap = await db.collection('rounds').limit(2000).get();
      const rounds = rSnap.docs.map((d: any) => ({ id: d.id, ...(d.data() || {}) }));
      const membersOf = (r: any) => [r.hostId, ...(r.coHostIds || []), ...(r.applicantIds || [])].filter(Boolean) as string[];
      const dateOf = (r: any) => (r.date ? new Date(`${r.date}T00:00:00+09:00`).getTime() : 0);

      const players = new Set<string>();
      const hosts = new Set<string>();
      let monthRounds = 0;
      const done: any[] = [];
      for (const r of rounds) {
        if (r.status === 'completed') {
          done.push(r);
          const t = r.completedAt || dateOf(r) || r.createdAt || 0;
          if (t >= monthStart) {
            const noShow = new Set(r.noShowIds || []);
            for (const m of membersOf(r)) if (!noShow.has(m)) players.add(m);
          }
        }
        if ((r.createdAt || 0) >= monthStart) { monthRounds++; if (r.hostId) hosts.add(r.hostId); }
      }
      // 満員率＝完了した募集の「メンバー数 / 定員」の平均（ホーム側の主催プッシュと同じ定義）。
      let fillRate = 0;
      if (done.length) {
        const sum = done.reduce((a, r) => a + Math.min(1, membersOf(r).length / Math.max(1, r.maxSpots || 1)), 0);
        fillRate = Math.round((sum / done.length) * 100);
      }
      kpi = {
        monthPlayers: players.size,
        monthRounds,
        monthHosts: hosts.size,
        fillRate,
        active30d: activeUsers.filter((u) => now - u.lastTs <= 30 * DAY).length,
      };
    } catch { /* best-effort */ }

    return NextResponse.json({
      generatedAt: now,
      kpi,
      summary: {
        active24h, active7d,
        totalUsersSeen: activeUsers.length,
        totalSwingUsers: swingUsers.length,
        totalSwings: swings.length,
        logsScanned: logs.length,
      },
      activeUsers: activeUsers.slice(0, 100),
      popularPages,
      acquisition,
      menuEntries,
      recentActions: recentActions.map((a: any) => ({
        ...a, name: nameOf(a.userId), toName: a.to ? nameOf(a.to) : '',
        roundTitle: roundTitleOf(a.page),
        rematchWith: rematchWith(a.page, a.userId),
      })),
      swingUsers,
      recentSwings,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
