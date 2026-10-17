import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// GET /api/admin/timeline-stats?token=&days=120 … タイムラインがどれくらい見られているか（2026-10-17）。
// _timelineViews（/api/timeline/view が記録）を、日ごと・週ごと（月曜はじまり）・月ごとにまとめる。
//   views＝開かれた回数／users＝見た人数（重複なし）／totalMs＝見ていた時間の合計／avgMs・medianMs＝1回あたり（時間が取れた回だけ）
// テスト垢は数えない。あわせて「今日の写真」の投稿数・リアクション数（timelinePosts）も同じ区切りで返す。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const JST = 9 * 3600 * 1000;

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}
const dayOf = (ms: number) => new Date(ms + JST).toISOString().slice(0, 10);
function weekOf(ms: number) {
  const d = new Date(ms + JST);
  const dow = (d.getUTCDay() + 6) % 7;   // 月曜=0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}
const monthOf = (ms: number) => new Date(ms + JST).toISOString().slice(0, 7);

type Bucket = { key: string; views: number; users: Set<string>; durs: number[]; posts: number; reactions: number };

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const days = Math.min(400, Math.max(7, parseInt(new URL(req.url).searchParams.get('days') || '120', 10) || 120));
  const since = Date.now() - days * 86400000;
  const { getTestAccountConfig } = await import('@/lib/testAccounts');
  const tcfg = await getTestAccountConfig().catch(() => null);
  const tset = new Set<string>((tcfg?.accounts || []).map((a: any) => a.id));
  const isTest = (id: string) => !id || id.startsWith('test_') || tset.has(id);

  const [vSnap, pSnap] = await Promise.all([
    adb.collection('_timelineViews').where('startAt', '>=', since).limit(20000).get(),
    adb.collection('timelinePosts').where('createdAt', '>=', since).limit(5000).get(),
  ]);
  const groups = { day: new Map<string, Bucket>(), week: new Map<string, Bucket>(), month: new Map<string, Bucket>() };
  const get = (m: Map<string, Bucket>, k: string) => { let b = m.get(k); if (!b) { b = { key: k, views: 0, users: new Set(), durs: [], posts: 0, reactions: 0 }; m.set(k, b); } return b; };
  const all = { views: 0, users: new Set<string>(), durs: [] as number[] };
  for (const d of vSnap.docs) {
    const x = d.data() || {};
    if (x.test || isTest(x.userId) || !x.startAt) continue;
    const dur = Number(x.durationMs || 0);
    for (const [g, k] of [['day', dayOf(x.startAt)], ['week', weekOf(x.startAt)], ['month', monthOf(x.startAt)]] as const) {
      const b = get(groups[g], k); b.views++; b.users.add(x.userId); if (dur > 0) b.durs.push(dur);
    }
    all.views++; all.users.add(x.userId); if (dur > 0) all.durs.push(dur);
  }
  for (const d of pSnap.docs) {
    const x = d.data() || {};
    if (x.test || isTest(x.userId) || !x.createdAt) continue;
    const rc = Object.values(x.reactions || {}).reduce((n: number, l: any) => n + (Array.isArray(l) ? l.length : 0), 0) as number;
    for (const [g, k] of [['day', dayOf(x.createdAt)], ['week', weekOf(x.createdAt)], ['month', monthOf(x.createdAt)]] as const) {
      const b = get(groups[g], k); b.posts++; b.reactions += rc;
    }
  }
  const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((p, q) => p - q); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const out = (m: Map<string, Bucket>) => Array.from(m.values()).sort((a, b) => b.key.localeCompare(a.key)).map((b) => ({
    key: b.key, views: b.views, users: b.users.size,
    totalMs: b.durs.reduce((a, c) => a + c, 0), avgMs: b.durs.length ? Math.round(b.durs.reduce((a, c) => a + c, 0) / b.durs.length) : 0,
    medianMs: median(b.durs), posts: b.posts, reactions: b.reactions,
  }));
  return NextResponse.json({
    days,
    total: { views: all.views, users: all.users.size, totalMs: all.durs.reduce((a, c) => a + c, 0), avgMs: all.durs.length ? Math.round(all.durs.reduce((a, c) => a + c, 0) / all.durs.length) : 0, medianMs: median(all.durs) },
    day: out(groups.day), week: out(groups.week), month: out(groups.month),
  }, { headers: noStore });
}
