import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';
import { getMeId } from '@/lib/session';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// POST /api/log — record a client-side telemetry event.
// Body: { event: string, data?: any, page?: string }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const body = await req.json().catch(() => ({}));
  const entry = {
    userId: meId,
    event: String(body.event || 'unknown').slice(0, 80),
    data: body.data ?? null,
    page: String(body.page || '').slice(0, 200),
    ua: req.headers.get('user-agent')?.slice(0, 200) || '',
    ts: Date.now(),
  };
  const db = getAdminDb() as any;
  if (db && !isDemoMode) {
    try {
      await db.collection('_logs').add(entry);
      // ポップアップの操作は集計しやすいよう専用の箱にも入れる（管理画面「📊 計測ハブ」・/api/admin/popups）（2026-10-12）
      if (entry.event === 'popup' && entry.data && typeof entry.data === 'object') {
        const d: any = entry.data;
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(d)) if (k !== 'id' && k !== 'action' && (typeof v === 'string' || typeof v === 'number')) extra[k] = typeof v === 'string' ? v.slice(0, 80) : v;
        await db.collection('_popupEvents').add({
          userId: meId, popup: String(d.id || '').slice(0, 40), action: String(d.action || '').slice(0, 40),
          ...(Object.keys(extra).length ? { extra } : {}), page: entry.page, ts: entry.ts,
        });
      }
    } catch (e) {
      console.error('[log] write failed', e);
    }
  }
  // Always echo to Vercel logs too.
  console.log('[client]', JSON.stringify(entry));
  return NextResponse.json({ ok: true }, { headers: noStore });
}

// GET /api/log?limit=50 — list this user's recent events.
export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const url = new URL(req.url);
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50);
  const db = getAdminDb() as any;
  if (!db || isDemoMode) {
    return NextResponse.json({ logs: [] }, { headers: noStore });
  }
  try {
    const snap = await db.collection('_logs')
      .where('userId', '==', meId)
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    const logs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ logs }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ logs: [], error: (e as Error).message }, { headers: noStore });
  }
}
