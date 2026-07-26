import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用アクセス分析。登録者数の推移（users.createdAt）＋アプリ内アクセスの
// 日別・時間帯別（_logs のテレメトリ）を集計して返す。SaaS的なダッシュボードの土台。
// 認証は他の管理APIと同じ ?token=ADMIN_LOG_TOKEN。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
const WINDOW_DAYS = 60;      // アクセス集計の対象期間
const LOGS_LIMIT = 20000;    // 読み取り上限（safety）

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// JST(+9h)基準の 'YYYY-MM-DD' と 時(0-23)。
function jstParts(ts: number): { day: string; hour: number } {
  const d = new Date(ts + 9 * 3600 * 1000);
  const day = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  return { day, hour };
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });

  try {
    const now = Date.now();
    const cutoff = now - WINDOW_DAYS * 86400 * 1000;

    // ── 登録者数の推移（users.createdAt を日別に）──
    const usersSnap = await db.collection('users').get();
    const regByDay = new Map<string, number>();
    let usersWithDate = 0;
    let usersTotal = 0;
    usersSnap.docs.forEach((d: any) => {
      usersTotal++;
      const c = d.data()?.createdAt;
      if (typeof c === 'number' && c > 0) {
        usersWithDate++;
        const { day } = jstParts(c);
        regByDay.set(day, (regByDay.get(day) || 0) + 1);
      }
    });
    const regDays = Array.from(regByDay.keys()).sort();
    let cum = usersTotal - usersWithDate; // createdAt無しの旧ユーザーを起点の累計に含める
    const registrations = regDays.map((date) => {
      const count = regByDay.get(date) || 0;
      cum += count;
      return { date, count, cumulative: cum };
    });

    // ── アクセス（_logs）を日別・時間帯別に。distinct userId と イベント数の両方 ──
    let logsSnap: any = null;
    try {
      logsSnap = await db.collection('_logs').where('ts', '>=', cutoff).orderBy('ts', 'asc').limit(LOGS_LIMIT).get();
    } catch {
      // 複合インデックス未整備などのフォールバック：新しい順に上限だけ取得しコードで絞る。
      logsSnap = await db.collection('_logs').orderBy('ts', 'desc').limit(LOGS_LIMIT).get();
    }

    const winUsers = new Set<string>(); // 期間内の実人数（ユニーク）
    const dayUsers = new Map<string, Set<string>>();
    const dayEvents = new Map<string, number>();
    const hourUsers: Array<Set<string>> = Array.from({ length: 24 }, () => new Set());
    const hourEvents: number[] = Array.from({ length: 24 }, () => 0);
    const dayHourUsers = new Map<string, Array<Set<string>>>(); // day -> [24]sets
    const dayHourEvents = new Map<string, number[]>();

    let logCount = 0;
    logsSnap.docs.forEach((doc: any) => {
      const x = doc.data() || {};
      const ts = typeof x.ts === 'number' ? x.ts : 0;
      if (!ts || ts < cutoff) return;
      const uid = String(x.userId || '');
      const { day, hour } = jstParts(ts);
      logCount++;

      if (uid) winUsers.add(uid);
      if (!dayUsers.has(day)) dayUsers.set(day, new Set());
      if (uid) dayUsers.get(day)!.add(uid);
      dayEvents.set(day, (dayEvents.get(day) || 0) + 1);

      if (uid) hourUsers[hour].add(uid);
      hourEvents[hour]++;

      if (!dayHourUsers.has(day)) {
        dayHourUsers.set(day, Array.from({ length: 24 }, () => new Set()));
        dayHourEvents.set(day, Array.from({ length: 24 }, () => 0));
      }
      if (uid) dayHourUsers.get(day)![hour].add(uid);
      dayHourEvents.get(day)![hour]++;
    });

    const accessDays = Array.from(dayUsers.keys()).sort();
    const byDay = accessDays.map((date) => ({
      date,
      users: dayUsers.get(date)!.size,
      events: dayEvents.get(date) || 0,
    }));
    const byHourOverall = Array.from({ length: 24 }, (_, h) => ({ hour: h, users: hourUsers[h].size, events: hourEvents[h] }));
    const byDayHour: Record<string, Array<{ hour: number; users: number; events: number }>> = {};
    for (const date of accessDays) {
      const us = dayHourUsers.get(date)!;
      const ev = dayHourEvents.get(date)!;
      byDayHour[date] = Array.from({ length: 24 }, (_, h) => ({ hour: h, users: us[h].size, events: ev[h] }));
    }

    return NextResponse.json({
      registrations: { byDay: registrations, total: usersTotal, withDate: usersWithDate },
      access: { windowDays: WINDOW_DAYS, sampled: logCount >= LOGS_LIMIT, uniqueUsers: winUsers.size, byDay, byHourOverall, byDayHour },
      generatedAt: now,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
