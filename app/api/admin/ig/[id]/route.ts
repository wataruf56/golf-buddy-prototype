import { NextRequest, NextResponse } from 'next/server';
import { deleteIgPost, getIgPost, recordIgBlocked, updateIgPost } from '@/lib/igPosts';
import { IG_CAPTION_LIMIT, isIgAccessError } from '@/lib/igPublish';
import { advancePublish } from '@/lib/igRunPublish';

// 1件の投稿を操作する。?token=ADMIN_LOG_TOKEN で保護。
//
//   POST /api/admin/ig/{id}?token=...
//     {action:'save',     caption?, imageUrl?}     内容を保存（下書きのまま）
//     {action:'schedule', scheduledAt:<epoch ms>}  予約する
//     {action:'unschedule'}                        予約を解除して下書きに戻す
//     {action:'publish'}                           今すぐ公開する
//     {action:'cancel'}                            取りやめ
//     {action:'delete'}                            削除（公開済みは一覧から隠すだけ）
//     {action:'hide'} / {action:'unhide'}          一覧の表示・非表示
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
      // 公開済みは消さない。指紋（signature）が消えると同じラウンドが再提案され、
      // 二重投稿になりうるため。代わりに一覧から隠す。
      if (post.status === 'published') {
        await updateIgPost(id, { hidden: true });
        return NextResponse.json(
          { ok: true, hidden: true, message: '公開済みなので、記録は残したまま一覧から消しました' },
          { headers: noStore });
      }
      await deleteIgPost(id);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'hide' || action === 'unhide') {
      await updateIgPost(id, { hidden: action === 'hide' });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'publish') {
      if (post.status === 'published') {
        return NextResponse.json({ error: '公開済みです' }, { status: 400, headers: noStore });
      }
      if (post.status === 'publishing') {
        return NextResponse.json({ error: 'いま公開処理中です' }, { status: 400, headers: noStore });
      }
      // 二重公開を防ぐため先に publishing にしてから叩く。
      await updateIgPost(id, { status: 'publishing', error: null });
      try {
        const r = await advancePublish({ ...post, status: 'publishing' });
        if (r.state === 'published') {
          await updateIgPost(id, {
            status: 'published', publishedAt: Date.now(),
            igMediaId: r.mediaId, containerId: null, containerAt: null, error: null,
          });
          return NextResponse.json({ ok: true, mediaId: r.mediaId }, { headers: noStore });
        }
        // 動画の変換が長引いた。publishing のまま残し、5分ごとの巡回が仕上げる。
        return NextResponse.json(
          { ok: true, pending: true, message: '動画を変換中です。終わり次第、自動で公開されます' },
          { headers: noStore });
      } catch (e) {
        const msg = (e as Error).message;
        if (isIgAccessError(e)) {
          // 接続が止まっているだけ。中身は無事なので元の状態に戻す。
          await recordIgBlocked(msg).catch(() => {});
          await updateIgPost(id, {
            status: post.status, containerId: null, containerAt: null, error: msg.slice(0, 500),
          });
          return NextResponse.json(
            { error: `Instagramに接続できません（${msg}）。下書きはそのまま残しています` },
            { status: 502, headers: noStore });
        }
        await updateIgPost(id, {
          status: 'failed', publishedAt: null, containerId: null, containerAt: null,
          error: msg.slice(0, 500),
        });
        return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
      }
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
