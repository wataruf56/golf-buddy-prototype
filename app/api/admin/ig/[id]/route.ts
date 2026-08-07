import { NextRequest, NextResponse } from 'next/server';
import { deleteIgPost, getIgPost, updateIgPost } from '@/lib/igPosts';
import { igPublishPost, IG_CAPTION_LIMIT } from '@/lib/igPublish';

// 1件の投稿を操作する。?token=ADMIN_LOG_TOKEN で保護。
//
//   POST /api/admin/ig/{id}?token=...
//     {action:'save',     caption?, imageUrl?}     内容を保存（下書きのまま）
//     {action:'schedule', scheduledAt:<epoch ms>}  予約する
//     {action:'unschedule'}                        予約を解除して下書きに戻す
//     {action:'publish'}                           今すぐ公開する
//     {action:'cancel'}                            取りやめ
//     {action:'delete'}                            下書きを削除（公開済みは不可）
//
// 公開はこの publish か、予約時刻に走る /api/cron/ig-publish-due だけ。

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function ok(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });

  const { id } = await ctx.params;
  const post = await getIgPost(id);
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404, headers: noStore });

  const body = await req.json().catch(() => ({} as any));
  const action = String(body?.action || '');

  try {
    if (action === 'save') {
      const patch: any = {};
      if (typeof body.caption === 'string') {
        if (body.caption.length > IG_CAPTION_LIMIT) {
          return NextResponse.json(
            { error: `本文が長すぎます（${body.caption.length}/${IG_CAPTION_LIMIT}）` },
            { status: 400, headers: noStore });
        }
        patch.caption = body.caption;
      }
      if (typeof body.imageUrl === 'string' && body.imageUrl.trim()) patch.imageUrl = body.imageUrl.trim();
      await updateIgPost(id, patch);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'schedule') {
      const at = Number(body?.scheduledAt || 0);
      if (!at || !isFinite(at)) {
        return NextResponse.json({ error: '予約時刻が不正です' }, { status: 400, headers: noStore });
      }
      if (post.status === 'published') {
        return NextResponse.json({ error: '公開済みです' }, { status: 400, headers: noStore });
      }
      // 「保存」を押し忘れても編集内容が消えないよう、本文も一緒に受け取る。
      const patch: any = { status: 'scheduled', scheduledAt: at, error: null };
      if (typeof body.caption === 'string') {
        if (body.caption.length > IG_CAPTION_LIMIT) {
          return NextResponse.json(
            { error: `本文が長すぎます（${body.caption.length}/${IG_CAPTION_LIMIT}）` },
            { status: 400, headers: noStore });
        }
        patch.caption = body.caption;
      }
      await updateIgPost(id, patch);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'unschedule') {
      await updateIgPost(id, { status: 'draft', scheduledAt: null });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'cancel') {
      await updateIgPost(id, { status: 'canceled', scheduledAt: null });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'delete') {
      if (post.status === 'published') {
        return NextResponse.json({ error: '公開済みは削除できません' }, { status: 400, headers: noStore });
      }
      await deleteIgPost(id);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'publish') {
      if (post.status === 'published') {
        return NextResponse.json({ error: '公開済みです' }, { status: 400, headers: noStore });
      }
      // 二重公開を防ぐため先に published にしてから叩く。
      await updateIgPost(id, { status: 'published', publishedAt: Date.now(), error: null });
      try {
        const mediaId = await igPublishPost(post.imageUrls, post.caption);
        await updateIgPost(id, { igMediaId: mediaId });
        return NextResponse.json({ ok: true, mediaId }, { headers: noStore });
      } catch (e) {
        await updateIgPost(id, {
          status: 'failed', publishedAt: null, error: (e as Error).message.slice(0, 500),
        });
        return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
      }
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
