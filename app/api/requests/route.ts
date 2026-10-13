import { NextRequest, NextResponse } from 'next/server';
import { getMeId } from '@/lib/session';
import {
  FEATURE_REQUEST_BODY_MAX, FEATURE_REQUEST_EMOJI, FEATURE_REQUEST_TITLE_MAX,
  isFeatureRequestCategory,
} from '@/lib/featureRequests';
import { authorsOf, listRequestDocs, notifyAdminsOfRequest, requestsCol, sortItems, toItem } from '@/lib/featureRequestsServer';

// 💡 改修要望（システム要望）。
//   GET  /api/requests                 → ログイン会員なら誰でも全スレッドを読める（テスト垢の要望は、見る人がテスト垢でなければ外す）
//   POST /api/requests { title, body, category } → スレッド作成＋最初のメッセージ（本人）。運営にお知らせ。
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    const rows = await listRequestDocs({ viewerId: meId });
    const authors = await authorsOf(rows.map((r) => r.data?.authorId));
    const items = sortItems(rows.map((r) => toItem(r.id, r.data, authors[r.data?.authorId] || { id: r.data?.authorId || '', displayName: 'メンバー' }, meId)));
    return NextResponse.json({ items }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const col = requestsCol();
  if (!col) return NextResponse.json({ error: 'firestore not initialized' }, { status: 500, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const title = String(body.title || '').trim().slice(0, FEATURE_REQUEST_TITLE_MAX);
  const text = String(body.body || '').trim().slice(0, FEATURE_REQUEST_BODY_MAX);
  const category = isFeatureRequestCategory(body.category) ? body.category : 'other';
  if (!title) return NextResponse.json({ error: 'title_required' }, { status: 400, headers: noStore });
  if (!text) return NextResponse.json({ error: 'body_required' }, { status: 400, headers: noStore });

  // 連投防止：同じ人が1分以内に2件は出せない。
  try {
    const recent = await col.where('authorId', '==', meId).orderBy('createdAt', 'desc').limit(1).get();
    const last = recent.docs[0]?.data()?.createdAt || 0;
    if (last && Date.now() - last < 60_000) return NextResponse.json({ error: 'too_fast' }, { status: 429, headers: noStore });
  } catch { /* 複合インデックスが無いときは素通し */ }

  const now = Date.now();
  const ref = col.doc();
  try {
    const batch = (col.firestore as any).batch();
    batch.set(ref, {
      authorId: meId, title, body: text, category, status: 'new',
      createdAt: now, updatedAt: now, lastMessageAt: now,
      lastMessage: text.slice(0, 120), lastSenderId: meId,
      replyCount: 0, votes: [], pinned: false, adminUnread: true, authorUnread: false,
    });
    batch.set(ref.collection('messages').doc(), { senderId: meId, text, createdAt: now });
    await batch.commit();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }

  // 運営へ（best-effort）。
  try {
    const { db } = await import('@/lib/db');
    const name = (await db.getUser(meId))?.displayName || 'メンバー';
    notifyAdminsOfRequest(ref.id, `${FEATURE_REQUEST_EMOJI.bulb} 新しい改修要望：「${title}」（${name}さん）`).catch(() => {});
  } catch { /* noop */ }

  return NextResponse.json({ ok: true, id: ref.id }, { headers: noStore });
}
