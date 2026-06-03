import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

const DAY = 24 * 60 * 60 * 1000;

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
    const logSnap = await db.collection('_logs').orderBy('ts', 'desc').limit(1000).get();
    const logs = logSnap.docs.map((d: any) => d.data());

    // Per-user rollup
    const perUser: Record<string, { count: number; lastTs: number; lastEvent: string; lastPage: string }> = {};
    for (const l of logs) {
      const uid = l.userId;
      if (!uid) continue;
      if (!perUser[uid]) perUser[uid] = { count: 0, lastTs: 0, lastEvent: '', lastPage: '' };
      perUser[uid].count++;
      if ((l.ts || 0) > perUser[uid].lastTs) {
        perUser[uid].lastTs = l.ts || 0;
        perUser[uid].lastEvent = l.event || '';
        perUser[uid].lastPage = l.page || '';
      }
    }

    // Recent raw actions (most useful events first — keep clicks/opens visible)
    const recentActions = logs.slice(0, 80).map((l: any) => ({
      userId: l.userId, event: l.event, page: l.page, ts: l.ts,
    }));

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
      .map(([id, v]) => ({ userId: id, name: nameOf(id), ...v }))
      .sort((a, b) => b.lastTs - a.lastTs);
    const active24h = activeUsers.filter((u) => now - u.lastTs <= DAY).length;
    const active7d = activeUsers.filter((u) => now - u.lastTs <= 7 * DAY).length;

    const swingUsers = Object.entries(swingPerUser)
      .map(([id, v]) => ({ userId: id, name: nameOf(id), ...v }))
      .sort((a, b) => b.total - a.total);

    const recentSwings = swings.slice(0, 40).map((s: any) => ({
      userId: s.userId, name: nameOf(s.userId), mode: s.mode, status: s.status, createdAt: s.createdAt,
    }));

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
      recentActions: recentActions.map((a: any) => ({ ...a, name: nameOf(a.userId) })),
      swingUsers,
      recentSwings,
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
