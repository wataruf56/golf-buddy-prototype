import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { warmTestIds, isTestId } from '@/lib/testAccounts';
import { POPUP_CATALOG } from '@/lib/popupCatalog';

// GET /api/admin/popups?token=XXX&days=30 … ポップアップの反応の集計（2026-10-12）
// もとデータ：_popupEvents（/api/log が popup イベントを入れる）。テスト垢は除く（?test=1 で含める）。
// ポップアップごとに：表示回数・表示した人数・操作ごとの人数／回数・成果率・何もしなかった人・表示から操作までの時間（中央値）・日別
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const DAY = 86400000;
const JST = 9 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days') || 30)));
  const includeTest = url.searchParams.get('test') === '1';
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const since = Date.now() - days * DAY;
  await warmTestIds().catch(() => {});

  type Ev = { userId: string; popup: string; action: string; ts: number; extra?: any };
  let events: Ev[] = [];
  try {
    const snap = await adb.collection('_popupEvents').where('ts', '>=', since).limit(50000).get();
    events = snap.docs.map((d: any) => d.data() as Ev).filter((e: Ev) => e.popup && e.action && (includeTest || !isTestId(e.userId)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  events.sort((a, b) => a.ts - b.ts);

  const dayKey = (ts: number) => new Date(ts + JST).toISOString().slice(0, 10);
  const dayList: string[] = [];
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) dayList.push(dayKey(Date.now() - i * DAY));

  const ids = Array.from(new Set([...POPUP_CATALOG.map((p) => p.id), ...events.map((e) => e.popup)]));
  const popups = ids.map((id) => {
    const def = POPUP_CATALOG.find((p) => p.id === id);
    const evs = events.filter((e) => e.popup === id);
    const shows = evs.filter((e) => e.action === 'show');
    const shownUsers = new Set(shows.map((e) => e.userId));
    const actions: Record<string, { count: number; users: number }> = {};
    const byAction: Record<string, Set<string>> = {};
    for (const e of evs) {
      if (e.action === 'show') continue;
      (actions[e.action] = actions[e.action] || { count: 0, users: 0 }).count += 1;
      (byAction[e.action] = byAction[e.action] || new Set()).add(e.userId);
    }
    for (const [a, set] of Object.entries(byAction)) actions[a].users = set.size;
    const terminal = new Set(def?.terminal || Object.keys(actions));
    const goal = new Set(def?.goal || []);
    const actedUsers = new Set(evs.filter((e) => terminal.has(e.action)).map((e) => e.userId));
    const goalUsers = new Set(evs.filter((e) => goal.has(e.action)).map((e) => e.userId));
    const noAction = Array.from(shownUsers).filter((u) => !actedUsers.has(u)).length;
    // 表示から最初の「閉じる操作」までの秒数（人ごと・表示のあと）
    const lastShow: Record<string, number> = {};
    const secs: number[] = [];
    for (const e of evs) {
      if (e.action === 'show') { lastShow[e.userId] = e.ts; continue; }
      if (terminal.has(e.action) && lastShow[e.userId]) { secs.push((e.ts - lastShow[e.userId]) / 1000); delete lastShow[e.userId]; }
    }
    secs.sort((a, b) => a - b);
    const median = secs.length ? Math.round(secs[Math.floor(secs.length / 2)]) : null;
    const daily = dayList.map((d) => ({
      day: d,
      shows: shows.filter((e) => dayKey(e.ts) === d).length,
      goals: evs.filter((e) => goal.has(e.action) && dayKey(e.ts) === d).length,
    }));
    return {
      id, name: def?.name || id, emoji: def?.emoji || '🪟', who: def?.who || '', forced: !!def?.forced,
      actionLabels: def?.actions || {}, goal: def?.goal || [],
      shows: shows.length, shownUsers: shownUsers.size,
      goalUsers: goalUsers.size, goalRate: shownUsers.size ? Math.round((goalUsers.size / shownUsers.size) * 100) : null,
      noAction, noActionRate: shownUsers.size ? Math.round((noAction / shownUsers.size) * 100) : null,
      medianSec: median, actions, daily,
      lastAt: evs.length ? evs[evs.length - 1].ts : 0,
    };
  });

  const totals = {
    events: events.length,
    shows: events.filter((e) => e.action === 'show').length,
    users: new Set(events.map((e) => e.userId)).size,
  };
  return NextResponse.json({ days, since, totals, popups, generatedAt: Date.now() }, { headers: noStore });
}
