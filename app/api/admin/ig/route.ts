import { NextRequest, NextResponse } from 'next/server';
import { createIgPost, getCronState, listIgPosts, listRoundImages, setRoundImage } from '@/lib/igPosts';
import { igConfigured, IG_CAROUSEL_MAX } from '@/lib/igPublish';
import { pushToMany } from '@/lib/linePush';

// 管理画面 /admin/ig 用。既存の管理APIと同じ ?token=ADMIN_LOG_TOKEN で保護する。
//
//   GET  /api/admin/ig?token=...            投稿一覧＋画像対応表
//   POST /api/admin/ig?token=...            新規下書き作成 / 画像の紐付け
//        body {action:'create', imageUrl, caption, roundId?}
//        body {action:'setImage', roundId, imageUrl}

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function ok(req: NextRequest): boolean {
  const token = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && token === expected;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    // ?all=1 で「一覧から消した」ものも含めて出す。
    const includeHidden = new URL(req.url).searchParams.get('all') === '1';
    const [posts, images, cron] = await Promise.all([
      listIgPosts(80, includeHidden), listRoundImages(), getCronState().catch(() => null),
    ]);
    return NextResponse.json({ posts, images, cron, igConfigured: igConfigured() }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: NextRequest) {
  if (!ok(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || '');

    if (action === 'setImage') {
      const roundId = String(body?.roundId || '').trim();
      const imageUrl = String(body?.imageUrl || '').trim();
      if (!roundId || !imageUrl) {
        return NextResponse.json({ error: 'roundId と imageUrl が必要です' }, { status: 400, headers: noStore });
      }
      const imageDate = String(body?.imageDate || '').trim() || undefined;
      const imageRest = typeof body?.imageRest === 'number' ? body.imageRest : undefined;
      await setRoundImage(roundId, imageUrl, { imageDate, imageRest });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }

    if (action === 'create') {
      // imageUrls を渡せばカルーセル（2〜10枚）になる。1枚なら通常の投稿。
      const list: string[] = Array.isArray(body?.imageUrls)
        ? body.imageUrls.map((u: any) => String(u).trim()).filter(Boolean)
        : [];
      const single = String(body?.imageUrl || '').trim();
      const imageUrls = list.length ? list : (single ? [single] : []);
      const videoUrl = String(body?.videoUrl || '').trim();     // 渡すとリールになる
      const coverUrl = String(body?.coverUrl || '').trim();
      const caption = String(body?.caption || '').trim();
      if ((!imageUrls.length && !videoUrl) || !caption) {
        return NextResponse.json(
          { error: 'imageUrl(s) か videoUrl、および caption が必要です' },
          { status: 400, headers: noStore });
      }
      if (imageUrls.length > IG_CAROUSEL_MAX) {
        return NextResponse.json(
          { error: `画像は${IG_CAROUSEL_MAX}枚までです` }, { status: 400, headers: noStore });
      }
      const post = await createIgPost({
        imageUrls, videoUrl: videoUrl || undefined, coverUrl: coverUrl || undefined, caption,
        roundId: String(body?.roundId || '').trim() || undefined,
        signature: String(body?.signature || '').trim() || undefined,
      });
      // 手で作った下書きもLINEで知らせる。cron由来だけ通知されると、
      // 「作ったのに飛んでこない」と見えてしまうため。
      const ids = (process.env.ADMIN_NOTIFY_USER_IDS || process.env.ADMIN_USER_IDS || '')
        .split(',').map((x) => x.trim()).filter(Boolean);
      if (ids.length) {
        const head = post.caption.split('\n')[0].slice(0, 30);
        const kind = post.mediaType === 'REELS' ? 'リール'
          : post.mediaType === 'CAROUSEL' ? `カルーセル${post.imageUrls.length}枚` : '写真';
        const base = (process.env.NEXTAUTH_URL || 'https://app.goltomo.com').replace(/\/+$/, '');
        await pushToMany(ids, `📷 下書きを追加しました（${kind}）
${head}`,
                         `${base}/admin/ig`, 'ig_draft').catch(() => {});
      }
      return NextResponse.json({ ok: true, post }, { headers: noStore });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
