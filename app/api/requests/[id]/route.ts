import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import { isTestAccount } from '@/lib/testAccounts';
import { authorInfo, getRequestDoc, listMessages, requestsCol, toItem } from '@/lib/featureRequestsServer';

// GET /api/requests/[id] → スレッド1件（本文＋メッセージ全件）。ログイン会員なら誰でも読める。
//   本人が開いたときは authorUnread（運営からの返信の未読）を消す。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const id = String(params?.id || '');
  try {
    const doc = await getRequestDoc(id);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    // テスト垢の要望は、見る人がテスト垢でなければ無いものとして扱う（一覧と同じ）。
    if (doc.data?.authorId !== meId && (await isTestAccount(doc.data?.authorId)) && !(await isTestAccount(meId))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    }
    const [author, messages] = await Promise.all([authorInfo(doc.data?.authorId), listMessages(id)]);
    if (doc.data?.authorId === meId && doc.data?.authorUnread) {
      try { await requestsCol()?.doc(id).set({ authorUnread: false }, { merge: true }); } catch { /* noop */ }
    }
    return NextResponse.json({ item: toItem(id, doc.data, author, meId), messages }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
