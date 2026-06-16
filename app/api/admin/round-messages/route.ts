import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用：ラウンドのグループチャットのメッセージを詳細閲覧し、不適切な発言を
// 個別削除する。メッセージは Firestore roundChats/{roundId}/messages に保存。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

// GET /api/admin/round-messages?token=XXX&roundId=YYY
export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  const roundId = new URL(req.url).searchParams.get('roundId') || '';
  if (!roundId) return NextResponse.json({ error: 'roundId required' }, { status: 400, headers: noStore });

  try {
    const snap = await db.collection('roundChats').doc(roundId).collection('messages').limit(1000).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    items.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));

    // 送信者名を解決
    const ids = Array.from(new Set(items.map((m: any) => m.senderId).filter(Boolean)));
    const users: Record<string, any> = {};
    await Promise.all(ids.map(async (uid) => {
      try {
        const us = await db.collection('users').doc(uid as string).get();
        users[uid as string] = us.exists
          ? { displayName: us.data().displayName || '', avatar: us.data().avatar || '⛳' }
          : { displayName: '(削除済み)', avatar: '?' };
      } catch { users[uid as string] = { displayName: uid as string, avatar: '?' }; }
    }));

    return NextResponse.json({ count: items.length, items, users }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// DELETE /api/admin/round-messages?token=XXX  body: { roundId, messageId }
export async function DELETE(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const db = getAdminDb() as any;
  if (!db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const roundId = String(body?.roundId || '').trim();
  const messageId = String(body?.messageId || '').trim();
  if (!roundId || !messageId) return NextResponse.json({ error: 'roundId & messageId required' }, { status: 400, headers: noStore });

  try {
    await db.collection('roundChats').doc(roundId).collection('messages').doc(messageId).delete();
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
