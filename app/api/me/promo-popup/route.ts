import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { activePromoFor, markPromoSeen, markPromoGo } from '@/lib/promoPopup';

// イチオシ募集のポップアップ（lib/promoPopup・components/RoundPromoPopup）（2026-10-12）
//   GET  … いま出すもの { promo: {...} | null }
//   POST { promoId, action?: 'go' } … 出した（1回だけ）。もう出さない／action:'go' は「参加してみる」を押した（集計用）
const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ promo: null }, { headers: noStore });
  const me = await db.getUser(meId);
  if (!me) return NextResponse.json({ promo: null }, { headers: noStore });
  return NextResponse.json({ promo: await activePromoFor(me).catch(() => null) }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const promoId = String(body.promoId || '');
  if (!promoId) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  if (body.action === 'go') await markPromoGo(meId, promoId);
  else await markPromoSeen(meId, promoId);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
