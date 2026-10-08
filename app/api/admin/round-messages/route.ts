import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase';

// 管理者用：ラウンドのグループチャットのメッセージを詳細閲覧し、不適切な発言を
// 個別削除する。メッセージは Firestore rounds/{roundId}/chat に保存。
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
    // 本体の保存先は rounds/{id}/chat（lib/db.addRoundMessage）。以前ここは roundChats/{id}/messages を読んでいて、管理画面に何も出ていなかった（2026-10-08 修正）
    const snap = await db.collection('rounds').doc(roundId).collection('chat').limit(1000).get();
    const items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    items.sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));

    // 送信者名を解決
    const ids = Array.from(new Set(items.map((m: any) => m.senderId).filter(Boolean)));
    const users: Record<string, any> = {};
    await Promise.all(ids.map(async (uid) => {
      if (uid === 'admin_manager') { users[uid] = { displayName: '管理人', avatar: '🛡️' }; return; }
      if (uid === 'system') { users[uid] = { displayName: 'お知らせ（自動）', avatar: '📣' }; return; }
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
    await db.collection('rounds').doc(roundId).collection('chat').doc(messageId).delete();
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

// POST /api/admin/round-messages?token=XXX  body: { roundId, text }
// 管理画面から「管理人」としてグループチャットに発言する（行ける日の部屋など。2026-10-08）。
// 参加者への通知はふつうの発言と同じ（@全員・@名前ならメンション通知）。
export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const roundId = String(body?.roundId || '').trim();
  const text = String(body?.text || '').trim().slice(0, 2000);
  if (!roundId || !text) return NextResponse.json({ error: 'roundId & text required' }, { status: 400, headers: noStore });
  const { db: appDb } = await import('@/lib/db');
  const round = await appDb.getRound(roundId);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const { ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME } = await import('@/lib/adminManagerId');
  const message = await appDb.addRoundMessage(roundId, ADMIN_MANAGER_ID, text);
  try {
    const { notifyRoundChat } = await import('@/lib/roundChatNotify');
    await notifyRoundChat(round, ADMIN_MANAGER_ID, ADMIN_MANAGER_NAME, text);
  } catch (e) { console.warn('[admin round-messages] notify failed', (e as Error).message); }
  try {
    const { audit, adminActor, AUDIT_ACTION } = await import('@/lib/auditLog');
    await audit({ action: AUDIT_ACTION.supportSend, ...(await adminActor(null)),
      targetKind: 'round', targetId: roundId, targetName: round.title, summary: `グループチャットに管理人として発言：${text.slice(0, 60)}` } as any, req);
  } catch { /* noop */ }
  return NextResponse.json({ ok: true, message }, { headers: noStore });
}
