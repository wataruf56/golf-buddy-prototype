import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { REACTION_KEYS } from '@/lib/chatReactions';

// POST /api/messages/react { chatId, messageId, key } … DM（1対1チャット）の発言にリアクションを付ける／外す（2026-10-13）
// グループチャットの /api/rounds/[id]/chat/react と同じ考え方：押すたびに切り替え、通知はしない。チャットの当事者だけ。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const chatId = String(body.chatId || ''); const messageId = String(body.messageId || ''); const key = String(body.key || '');
  if (!/^[A-Za-z0-9_-]{3,200}$/.test(chatId) || !/^[A-Za-z0-9_-]{1,64}$/.test(messageId) || !REACTION_KEYS.includes(key)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  }
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const chatRef = adb.collection('chats').doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  if (!((chatSnap.data() || {}).participants || []).includes(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const ref = chatRef.collection('messages').doc(messageId);
  const reactions = await adb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('not_found');
    const cur: Record<string, string[]> = { ...((snap.data() || {}).reactions || {}) };
    const list = new Set<string>(cur[key] || []);
    if (list.has(meId)) list.delete(meId); else list.add(meId);
    if (list.size) cur[key] = Array.from(list); else delete cur[key];
    tx.update(ref, { reactions: cur });   // 外したキーが残らないよう丸ごと置き換える
    return cur;
  }).catch((e: Error) => ({ __error: e.message }));
  if ((reactions as any).__error) return NextResponse.json({ error: (reactions as any).__error }, { status: 400, headers: noStore });
  return NextResponse.json({ ok: true, reactions }, { headers: noStore });
}
