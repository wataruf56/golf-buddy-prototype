import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { FEATURE_REQUEST_EMOJI, FEATURE_REQUEST_MESSAGE_MAX } from '@/lib/featureRequests';
import { appendMessage, getRequestDoc, notifyAdminsOfRequest } from '@/lib/featureRequestsServer';

// POST /api/requests/[id]/messages { text } → 本人だけがスレッドに返信できる（ほかの会員は読むだけ・👍 で後押し）。
//   運営へお知らせ（アプリ内＋LINE）。
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const id = String(params?.id || '');
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const text = String(body.text || '').trim().slice(0, FEATURE_REQUEST_MESSAGE_MAX);
  if (!text) return NextResponse.json({ error: 'text_required' }, { status: 400, headers: noStore });

  try {
    const doc = await getRequestDoc(id);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    if (doc.data?.authorId !== meId) return NextResponse.json({ error: 'forbidden', message: '返信できるのは要望を出した本人と運営だけです' }, { status: 403, headers: noStore });
    const message = await appendMessage(id, meId, text, { countAsReply: true });
    try {
      const { db } = await import('@/lib/db');
      const name = (await db.getUser(meId))?.displayName || 'メンバー';
      notifyAdminsOfRequest(id, `${FEATURE_REQUEST_EMOJI.bulb} 改修要望「${String(doc.data?.title || '').slice(0, 30)}」に${name}さんから返信`).catch(() => {});
    } catch { /* noop */ }
    return NextResponse.json({ ok: true, message }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
