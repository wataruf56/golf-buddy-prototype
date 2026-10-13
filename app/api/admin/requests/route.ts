import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_REQUEST_ADMIN_SENDER, FEATURE_REQUEST_MESSAGE_MAX, isFeatureRequestStatus } from '@/lib/featureRequests';
import {
  appendMessage, authorInfo, authorsOf, getRequestDoc, listMessages, listRequestDocs,
  notifyAuthorOfAdminReply, requestsCol, sortItems, toItem,
} from '@/lib/featureRequestsServer';
import { isTestAccount } from '@/lib/testAccounts';

// 管理画面：💡 改修要望（/admin/requests）。
//   GET   ?token=..[&status=new|reviewing|working|done|declined]  → 全スレッド（テスト垢の分も含め、isTest 付き）
//   GET   ?token=..&id=..                                          → スレッド1件＋メッセージ全件（開くと adminUnread を消す）
//   POST  ?token=..  { id, text }                                  → 「🛡️ ゴルトモ運営」として返信（本人にアプリ内＋LINE）
//   PATCH ?token=..  { id, status?, pinned? }                      → 状態の変更／ピン留め（通知なし。状態変更は本人にアプリ内お知らせだけ）
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function checkToken(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const status = url.searchParams.get('status') || '';
  try {
    if (id) {
      const doc = await getRequestDoc(id);
      if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
      const [author, messages] = await Promise.all([authorInfo(doc.data?.authorId), listMessages(id)]);
      if (doc.data?.adminUnread) {
        try { await requestsCol()?.doc(id).set({ adminUnread: false }, { merge: true }); } catch { /* noop */ }
      }
      return NextResponse.json({
        item: { ...toItem(id, doc.data, author, null), isTest: await isTestAccount(doc.data?.authorId), adminUnread: false },
        messages,
      }, { headers: noStore });
    }
    const rows = await listRequestDocs({ viewerId: null, includeTest: true });
    const authors = await authorsOf(rows.map((r) => r.data?.authorId));
    const items = sortItems(await Promise.all(rows
      .filter((r) => !status || (r.data?.status || 'new') === status)
      .map(async (r) => ({
        ...toItem(r.id, r.data, authors[r.data?.authorId] || { id: r.data?.authorId || '', displayName: 'メンバー' }, null),
        isTest: await isTestAccount(r.data?.authorId),
        adminUnread: !!r.data?.adminUnread,
      }))));
    const counts: Record<string, number> = {};
    for (const r of rows) { const s = r.data?.status || 'new'; counts[s] = (counts[s] || 0) + 1; }
    return NextResponse.json({ items, counts, total: rows.length }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const id = String(body.id || '').trim();
  const text = String(body.text || '').trim().slice(0, FEATURE_REQUEST_MESSAGE_MAX);
  if (!id || !text) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
  try {
    const doc = await getRequestDoc(id);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    const message = await appendMessage(id, FEATURE_REQUEST_ADMIN_SENDER, text, { countAsReply: true });
    // 受付のまま返信したら「検討中」に進める（運営が目を通した証）。それ以外の状態は触らない。
    if ((doc.data?.status || 'new') === 'new') {
      try { await requestsCol()?.doc(id).set({ status: 'reviewing', adminUnread: false }, { merge: true }); } catch { /* noop */ }
    } else {
      try { await requestsCol()?.doc(id).set({ adminUnread: false }, { merge: true }); } catch { /* noop */ }
    }
    notifyAuthorOfAdminReply(id, String(doc.data?.authorId || ''), String(doc.data?.title || '')).catch(() => {});
    return NextResponse.json({ ok: true, message }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkToken(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { return NextResponse.json({ error: 'bad json' }, { status: 400, headers: noStore }); }
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: noStore });
  const patch: any = {};
  if (body.status !== undefined) {
    if (!isFeatureRequestStatus(body.status)) return NextResponse.json({ error: 'bad_status' }, { status: 400, headers: noStore });
    patch.status = body.status;
  }
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'no fields' }, { status: 400, headers: noStore });
  try {
    const doc = await getRequestDoc(id);
    if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
    await requestsCol()?.doc(id).set({ ...patch, updatedAt: Date.now() }, { merge: true });
    // 状態が変わったら本人にアプリ内お知らせだけ（LINEは送らない。返信があればそちらで届く）。
    if (patch.status && patch.status !== (doc.data?.status || 'new') && doc.data?.authorId) {
      try {
        const { FEATURE_REQUEST_STATUS_META, FEATURE_REQUEST_EMOJI } = await import('@/lib/featureRequests');
        const { addNotification } = await import('@/lib/notifications');
        await addNotification(
          String(doc.data.authorId), 'dm',
          `${FEATURE_REQUEST_EMOJI.bulb} 改修要望「${String(doc.data.title || '').slice(0, 30)}」が「${FEATURE_REQUEST_STATUS_META[patch.status as keyof typeof FEATURE_REQUEST_STATUS_META].short}」になりました`,
          `/requests/${id}`,
        );
      } catch { /* noop */ }
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
