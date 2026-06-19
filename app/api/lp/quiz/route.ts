import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/demoMode';
import { getAdminDb } from '@/lib/firebase';

// Public (no-login) collection endpoint for the LP diagnosis quiz. LP visitors
// are NOT authenticated, so this is intentionally open + CORS-enabled. Stores
// each answer/completion event in Firestore `_lpQuiz` so we can analyze which
// options people pick and which patterns lead to which result type.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
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
    // クルマ・送迎の希望（単一）。event:'signal' のときに入る。
    pickup: s(body.pickup, 40),
    // ピックアップ場所（駅・複数）。pickup が可能/希望のときに入る。
    pickupPlaces: arr(body.pickupPlaces),
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
    const visitors = new Set<string>();          // 永続の匿名訪問者ID（ユニーク人数）
    const startVisitors = new Set<string>();      // 診断スタートしたユニーク訪問者
    const completeVisitors = new Set<string>();   // 診断完了したユニーク訪問者
    const signalVisitors = new Set<string>();    // 興味シグナルを登録したユニーク訪問者
    const areaCounts: Record<string, number> = {};   // 行けるエリア別
    const dayCounts: Record<string, number> = {};    // 行ける曜日別（土日祝/平日）
    const comboCounts: Record<string, number> = {};  // 「エリア×曜日」需要プール
    const pickupCounts: Record<string, number> = {}; // クルマ・送迎の希望
    const pickupPlaceCounts: Record<string, number> = {}; // ピックアップ場所（駅）
    const stepReach: Record<string, number> = {};    // 各設問への到達（回答数）= 離脱分析
    const daily: Record<string, { visit: number; start: number; complete: number; signal: number }> = {};
    const byRef: Record<string, number> = {};     // 流入元（来訪単位）
    const byDevice = { mobile: 0, desktop: 0 };    // デバイス（来訪単位）
    const byHour: number[] = Array(24).fill(0);    // 時間帯（来訪単位・JST）
    let visits = 0, starts = 0, completes = 0, ctas = 0, shares = 0, signals = 0;

    const JST = 9 * 3600 * 1000; // 日次バケットは日本時間で切る
    const dayKey = (ts: any) => { try { return new Date((Number(ts) || 0) + JST).toISOString().slice(0, 10); } catch { return ''; } };
    const bucket = (k: string) => { if (!k) return null; daily[k] = daily[k] || { visit: 0, start: 0, complete: 0, signal: 0 }; return daily[k]; };

    for (const d of docs) {
      if (d.sessionId) sessions.add(d.sessionId);
      if (d.visitorId) visitors.add(d.visitorId);
      const dk = dayKey(d.ts);
      if (d.event === 'visit') {
        visits++; const b = bucket(dk); if (b) b.visit++;
        // 来訪単位の流入元・デバイス・時間帯
        if (d.ref) { try { byRef[new URL(d.ref).hostname.replace(/^www\./, '')] = (byRef[new URL(d.ref).hostname.replace(/^www\./, '')] || 0) + 1; } catch { byRef['その他'] = (byRef['その他'] || 0) + 1; } }
        else byRef['直接 / 不明'] = (byRef['直接 / 不明'] || 0) + 1;
        if (/Mobile|Android|iPhone|iPad/i.test(String(d.ua || ''))) byDevice.mobile++; else byDevice.desktop++;
        try { const hr = new Date((Number(d.ts) || 0) + JST).getUTCHours(); if (hr >= 0 && hr < 24) byHour[hr]++; } catch {}
      }
      if (d.event === 'start') { starts++; if (d.visitorId) startVisitors.add(d.visitorId); const b = bucket(dk); if (b) b.start++; }
      if (d.event === 'answer' && d.qid) {
        byOption[d.qid] = byOption[d.qid] || {};
        const key = `${d.optionId} ${d.optionLabel}`.trim();
        byOption[d.qid][key] = (byOption[d.qid][key] || 0) + 1;
        stepReach[d.qid] = (stepReach[d.qid] || 0) + 1;
      }
      if (d.event === 'complete') {
        completes++; if (d.visitorId) completeVisitors.add(d.visitorId); const b = bucket(dk); if (b) b.complete++;
        if (d.resultType) byResult[d.resultType] = (byResult[d.resultType] || 0) + 1;
        const pat = Array.isArray(d.pattern) ? d.pattern.join(',') : String(d.pattern || '');
        if (pat) byPattern[pat] = (byPattern[pat] || 0) + 1;
      }
      if (d.event === 'signal') {
        signals++; const b = bucket(dk); if (b) b.signal++;
        if (d.visitorId) signalVisitors.add(d.visitorId);
        const as: string[] = Array.isArray(d.areas) ? d.areas : [];
        const ds: string[] = Array.isArray(d.days) ? d.days : [];
        for (const a of as) areaCounts[a] = (areaCounts[a] || 0) + 1;
        for (const dd of ds) dayCounts[dd] = (dayCounts[dd] || 0) + 1;
        for (const a of as) for (const dd of ds) { const k = `${a}×${dd}`; comboCounts[k] = (comboCounts[k] || 0) + 1; }
        if (d.pickup) pickupCounts[d.pickup] = (pickupCounts[d.pickup] || 0) + 1;
        const pp: string[] = Array.isArray(d.pickupPlaces) ? d.pickupPlaces : [];
        for (const p of pp) pickupPlaceCounts[p] = (pickupPlaceCounts[p] || 0) + 1;
      }
      if (d.event === 'cta') ctas++;
      if (d.event === 'share') shares++;
    }

    const dailyArr = Object.keys(daily).sort().map((k) => ({ date: k, ...daily[k] }));

    // 生データ一覧（最新300件・削除UI用）。snap は ts 降順。
    const raw = snap.docs.slice(0, 300).map((doc: any) => {
      const x = doc.data();
      return {
        id: doc.id,
        ts: x.ts || 0,
        event: x.event || '',
        visitorId: x.visitorId || '',
        sessionId: x.sessionId || '',
        resultType: x.resultType || '',
        qid: x.qid || '',
        optionLabel: x.optionLabel || '',
        page: x.page || '',
        ref: x.ref || '',
        ua: String(x.ua || '').slice(0, 60),
      };
    });

    // LINEアカウントと紐付いた通知希望（_lpSignal）。③で保存される個人単位データ。
    let linkedSignals = 0;
    const linkedUsers = new Set<string>();
    try {
      const sigSnap = await db.collection('_lpSignal').limit(5000).get();
      sigSnap.docs.forEach((d: any) => {
        const x = d.data();
        linkedSignals++;
        if (x.lineUserId) linkedUsers.add(x.lineUserId);
      });
    } catch { /* コレクション未作成等は無視 */ }

    return NextResponse.json({
      linkedSignals,
      linkedUsers: linkedUsers.size,
      scanned: docs.length,
      uniqueSessions: sessions.size,
      uniqueVisitors: visitors.size,
      visits, starts, completes, signals, ctas, shares,
      uniqueStarts: startVisitors.size,
      uniqueCompletes: completeVisitors.size,
      completionRate: starts ? +(completes / starts).toFixed(3) : null,
      signalRate: completes ? +(signals / completes).toFixed(3) : null,
      uniqueSignalVisitors: signalVisitors.size,
      byOption, byResult, byPattern, stepReach,
      demand: { areaCounts, dayCounts, comboCounts, pickupCounts, pickupPlaceCounts },
      daily: dailyArr,
      byRef, byDevice, byHour,
      raw,
      serverTime: new Date().toISOString(),
    }, { headers: cors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
}

// DELETE /api/lp/quiz?token=XXX  body: { id } | { visitorId } | { sessionId }
// 計測データを削除する。id=1件削除 / visitorId・sessionId=その単位を一括削除。
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: cors });
  }
  if (isDemoMode) return NextResponse.json({ note: 'demo mode' }, { headers: cors });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const id = String(body?.id || '').trim();
  const visitorId = String(body?.visitorId || '').trim();
  const sessionId = String(body?.sessionId || '').trim();
  const all = body?.all === true;

  try {
    if (id) {
      await db.collection('_lpQuiz').doc(id).delete();
      return NextResponse.json({ ok: true, deleted: 1 }, { headers: cors });
    }
    // 全削除（ゼロからやり直す用）。バッチで全件消す。
    if (all) {
      let deleted = 0;
      for (let loop = 0; loop < 100; loop++) {
        const snap = await db.collection('_lpQuiz').limit(450).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach((d: any) => { batch.delete(d.ref); deleted++; });
        await batch.commit();
        if (snap.size < 450) break;
      }
      return NextResponse.json({ ok: true, deleted, all: true }, { headers: cors });
    }
    const field = visitorId ? 'visitorId' : sessionId ? 'sessionId' : '';
    const value = visitorId || sessionId;
    if (!field) return NextResponse.json({ error: 'id / visitorId / sessionId のいずれかが必要です' }, { status: 400, headers: cors });

    const snap = await db.collection('_lpQuiz').where(field, '==', value).limit(3000).get();
    let deleted = 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch();
      docs.slice(i, i + 450).forEach((d: any) => { batch.delete(d.ref); deleted++; });
      await batch.commit();
    }
    return NextResponse.json({ ok: true, deleted }, { headers: cors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: cors });
  }
}
