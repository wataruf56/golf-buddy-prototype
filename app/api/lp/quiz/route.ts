import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';

// Public (no-login) collection endpoint for the LP diagnosis quiz. LP visitors
// are NOT authenticated, so this is intentionally open + CORS-enabled. Stores
// each answer/completion event in Firestore `_lpQuiz` so we can analyze which
// options people pick and which patterns lead to which result type.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

// POST /api/lp/quiz — record a quiz event.
// Body (JSON, may arrive as text/plain via sendBeacon):
//   { sessionId, event:'start'|'answer'|'complete'|'cta', qid?, optionId?,
//     optionLabel?, step?, total?, resultType?, pattern?, page?, ref? }
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch { body = {}; }

  const s = (v: any, n = 120) => (v == null ? '' : String(v).slice(0, n));
  const arr = (v: any) => Array.isArray(v) ? v.map((x: any) => s(x, 40)).slice(0, 30) : [];
  const entry = {
    // 永続の匿名訪問者ID（localStorage）。セッションをまたいでユニーク計測する。
    visitorId: s(body.visitorId, 60),
    sessionId: s(body.sessionId, 60),
    event: s(body.event, 20) || 'unknown',
    // 興味シグナル（行けるエリア・曜日）。event:'signal' のときに入る。
    areas: arr(body.areas),
    days: arr(body.days),
    qid: s(body.qid, 40),
    optionId: s(body.optionId, 40),
    optionLabel: s(body.optionLabel, 120),
    step: typeof body.step === 'number' ? body.step : null,
    total: typeof body.total === 'number' ? body.total : null,
    resultType: s(body.resultType, 60),
    // Full answer pattern (e.g. "q1:b,q2:c,..."); kept as a short string.
    pattern: Array.isArray(body.pattern) ? body.pattern.map((x: any) => s(x, 40)).slice(0, 20) : s(body.pattern, 300),
    page: s(body.page, 200),
    ref: s(body.ref, 200),
    ua: req.headers.get('user-agent')?.slice(0, 200) || '',
    ts: Date.now(),
  };

  const db = getAdminDb() as any;
  if (db && !isDemoMode) {
    try { await db.collection('_lpQuiz').add(entry); }
    catch (e) { console.error('[lp/quiz] write failed', e); }
  }
  console.log('[lpQuiz]', JSON.stringify(entry));
  return NextResponse.json({ ok: true }, { headers: cors });
}

// GET /api/lp/quiz?token=XXX&limit=N — aggregate view for analysis.
// Token must match ADMIN_LOG_TOKEN. Returns per-question/option counts,
// per-result-type counts, and full-pattern counts.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: cors });
  }
  if (isDemoMode) return NextResponse.json({ note: 'demo mode' }, { headers: cors });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: cors });

  const limit = Math.min(20000, parseInt(url.searchParams.get('limit') || '5000', 10) || 5000);
  try {
    const snap = await db.collection('_lpQuiz').orderBy('ts', 'desc').limit(limit).get();
    const docs = snap.docs.map((d: any) => d.data());

    const byOption: Record<string, Record<string, number>> = {};
    const byResult: Record<string, number> = {};
    const byPattern: Record<string, number> = {};
    const sessions = new Set<string>();
    let starts = 0, completes = 0, ctas = 0;

    for (const d of docs) {
      if (d.sessionId) sessions.add(d.sessionId);
      if (d.event === 'start') starts++;
      if (d.event === 'answer' && d.qid) {
        byOption[d.qid] = byOption[d.qid] || {};
        const key = `${d.optionId} ${d.optionLabel}`.trim();
        byOption[d.qid][key] = (byOption[d.qid][key] || 0) + 1;
      }
      if (d.event === 'complete') {
        completes++;
        if (d.resultType) byResult[d.resultType] = (byResult[d.resultType] || 0) + 1;
        const pat = Array.isArray(d.pattern) ? d.pattern.join(',') : String(d.pattern || '');
        if (pat) byPattern[pat] = (byPattern[pat] || 0) + 1;
      }
      if (d.event === 'cta') ctas++;
    }

    return NextResponse.json({
      scanned: docs.length,
      uniqueSessions: sessions.size,
      starts, completes, ctas,
      completionRate: starts ? +(completes / starts).toFixed(3) : null,
      byOption, byResult, byPattern,
      serverTime: new Date().toISOString(),
    }, { headers: cors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
}
