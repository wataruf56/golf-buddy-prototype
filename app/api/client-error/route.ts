import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';
import { isDemoMode } from '@/lib/demoMode';
import { getMeId } from '@/lib/session';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// POST /api/client-error — 画面側で起きた例外の記録。未ログインでも受け付ける。
// 「Application error: a client-side exception has occurred」の中身がどこにも残らず、
// 実機（iPhone の Safari）でしか分からなかった（2026-10-06・シェアURLで発生）。
// Cloud Logging には `[client-error]` で出し、Firestore の `_clientErrors` にも残す。
// 読み方：gcloud logging read 'textPayload:"[client-error]"' または Firestore の _clientErrors。
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}
  let meId: string | null = null;
  try { meId = await getMeId(); } catch { meId = null; }
  const entry = {
    userId: meId || '',
    kind: String(body.kind || 'error').slice(0, 40),          // error / unhandledrejection / boundary
    message: String(body.message || '').slice(0, 500),
    stack: String(body.stack || '').slice(0, 2000),
    url: String(body.url || '').slice(0, 300),
    build: String(body.build || '').slice(0, 40),
    ua: req.headers.get('user-agent')?.slice(0, 300) || '',
    ts: Date.now(),
  };
  if (!entry.message) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  console.error('[client-error]', JSON.stringify(entry));
  const db = getAdminDb() as any;
  if (db && !isDemoMode) {
    try { await db.collection('_clientErrors').add(entry); } catch { /* 記録できなくても画面は止めない */ }
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
