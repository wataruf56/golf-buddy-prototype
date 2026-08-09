import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

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
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const now = Date.now();
  try {
    // --- 1+2) Activity from client telemetry ---
    // page_view が大量に混ざるため広めに取得。①が参照する操作が②に必ず含まれるよう、
    // ②の表示件数も十分に増やして（下記 slice）窓を揃える。
    const logSnap = await db.collection('_logs').orderBy('ts', 'desc').limit(4000).get();
    const logs = logSnap.docs.map((d: any) => d.data());

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
      .slice(0, 500)
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
      swings = swSnap.docs.map((d: any) => d.data());
    } catch {
      // Fallback without orderBy (older docs missing createdAt index)
      const swSnap = await db.collection('swings').limit(500).get();
      swings = swSnap.docs.map((d: any) => d.data());
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
    const ids = Array.from(new Set([...Object.keys(perUser), ...Object.keys(swingPerUser)]));
    const names: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      if (!chunk.length) continue;
      const us = await db.collection('users').where('__name__', 'in', chunk).get();
      us.docs.forEach((d: any) => { names[d.id] = d.data().displayName || ''; });
    }
    const nameOf = (id: string) => names[id] || '(未登録)';

    // --- Assemble ---
    const activeUsers = Object.entries(perUser)
      .map(([id, v]) => ({ userId: id, name: nameOf(id), ...v, lastPageNorm: normPage(v.lastPage || '') }))
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
        if (u.isSystem) return; // 管理人などは除外
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

    return NextResponse.json({
      generatedAt: now,
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
      recentActions: recentActions.map((a: any) => ({ ...a, name: nameOf(a.userId), toName: a.to ? nameOf(a.to) : '' })),
      swingUsers,
      recentSwings,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
