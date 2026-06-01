import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { saveSubscription, removeSubscription, type PushSub } from '@/lib/webPush';

const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

// GET /api/push/subscribe → { vapidPublicKey } so the client can subscribe.
export async function GET() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  return NextResponse.json({ vapidPublicKey: pub }, { headers: noStore });
}

// POST /api/push/subscribe  body: { subscription: PushSubscriptionJSON }
// Stores the caller's push subscription so the server can notify them.
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const sub: PushSub | undefined = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400, headers: noStore });
  }
  try { await saveSubscription(meId, sub); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}

// DELETE /api/push/subscribe  body: { endpoint }
export async function DELETE(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const endpoint: string = body?.endpoint || '';
  if (endpoint) { try { await removeSubscription(meId, endpoint); } catch {} }
  return NextResponse.json({ ok: true }, { headers: noStore });
}
