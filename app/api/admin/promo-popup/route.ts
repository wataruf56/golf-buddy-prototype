import { NextRequest, NextResponse } from 'next/server';
import { deletePromo, listPromos, upsertPromo, promoStats } from '@/lib/promoPopup';
import { db } from '@/lib/db';

// 管理者用：イチオシ募集のポップアップ（lib/promoPopup）（2026-10-12）
//   GET    … 一覧
//   POST   … { id, roundId, showAt: ms | 'YYYY-MM-DDTHH:mm'(JST), until?, approved, headline? }
//   DELETE … { id }
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };
function ok(req: NextRequest) {
  const t = new URL(req.url).searchParams.get('token') || '';
  const e = process.env.ADMIN_LOG_TOKEN || '';
  return !!e && t === e;
}
function toMs(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Date.parse(`${s}:00+09:00`);
  const n = Number(s); return Number.isFinite(n) ? n : undefined;
}
export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const promos = (await listPromos()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = await Promise.all(promos.map(async (p) => {
    const r: any = await db.getRound(p.roundId).catch(() => null);
    return {
      ...p,
      round: r ? { id: r.id, title: r.title || r.courseName || 'ラウンド', date: r.date || '', startTime: r.startTime || '', area: r.area || '', status: r.status, joined: 1 + (r.applicantIds || []).length, maxSpots: r.maxSpots || 0 } : null,
      stats: await promoStats(p),
    };
  }));
  return NextResponse.json({ promos: rows }, { headers: noStore });
}
export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let b: any = {};
  try { b = (await req.json()) || {}; } catch { /* noop */ }
  const id = String(b.id || '') || (b.create ? `promo_${Date.now().toString(36)}` : '');
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  const patch: any = {};
  if (b.roundId) patch.roundId = String(b.roundId);
  const s = toMs(b.showAt); if (s !== undefined) patch.showAt = s;
  const u = toMs(b.until); if (u !== undefined) patch.until = u;
  if (typeof b.approved === 'boolean') patch.approved = b.approved;
  if (typeof b.headline === 'string') patch.headline = b.headline.slice(0, 60);
  return NextResponse.json({ ok: true, promo: await upsertPromo(id, patch) }, { headers: noStore });
}
export async function DELETE(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let b: any = {};
  try { b = (await req.json()) || {}; } catch { /* noop */ }
  await deletePromo(String(b.id || ''));
  return NextResponse.json({ ok: true }, { headers: noStore });
}
