import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { REACTION_KEYS } from '@/lib/chatReactions';

// POST /api/rounds/[id]/chat/react { messageId, key } … グループチャットの発言にリアクションを付ける／外す（押すたびに切り替え）（2026-10-12）
// 参加している人（主催者・参加確定）だけ。システムの1行には付けない。通知はしない（気軽さ優先）。
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const messageId = String(body.messageId || '');
  const key = String(body.key || '');
  if (!messageId || !REACTION_KEYS.includes(key)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  const adb = getAdminDb() as any;
  if (!adb) return NextResponse.json({ error: 'no_db' }, { status: 500, headers: noStore });
  const ref = adb.collection('rounds').doc(params.id).collection('chat').doc(messageId);
  const reactions = await adb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('not_found');
    const d = snap.data() || {};
    if (d.senderId === 'system') throw new Error('system');
    const cur: Record<string, string[]> = { ...(d.reactions || {}) };
    const list = new Set<string>(cur[key] || []);
    if (list.has(meId)) list.delete(meId); else list.add(meId);
    if (list.size) cur[key] = Array.from(list); else delete cur[key];
    // set(merge) だと外したキーが残るので、reactions だけ丸ごと置き換える
    tx.update(ref, { reactions: cur });
    return cur;
  }).catch((e: Error) => ({ __error: e.message }));
  if ((reactions as any).__error) return NextResponse.json({ error: (reactions as any).__error }, { status: 400, headers: noStore });
  return NextResponse.json({ ok: true, reactions }, { headers: noStore });
}
