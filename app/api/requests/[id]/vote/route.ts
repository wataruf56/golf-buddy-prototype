import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { getAdminDb } from '@/lib/firebase';
import { requestsCol } from '@/lib/featureRequestsServer';

// POST /api/requests/[id]/vote → 「👍 ほしい」を押す／取り消す（1人1回・トグル）。本人以外の会員が後押しするためのもの。
//   返り値 { ok, voted, voteCount }
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const col = requestsCol();
  const db = getAdminDb() as any;
  if (!col || !db) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });
  const id = String(params?.id || '');
  const ref = col.doc(id);
  try {
    const result = await db.runTransaction(async (tx: any) => {
      const cur = await tx.get(ref);
      if (!cur.exists) throw new Error('not_found');
      const votes: string[] = Array.isArray(cur.data()?.votes) ? cur.data().votes : [];
      const has = votes.includes(meId);
      const next = has ? votes.filter((v) => v !== meId) : [...votes, meId];
      // 👍 は「最新の動き」には数えない（lastMessageAt は触らない）。
      tx.set(ref, { votes: next, updatedAt: Date.now() }, { merge: true });
      return { voted: !has, voteCount: next.length };
    });
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
