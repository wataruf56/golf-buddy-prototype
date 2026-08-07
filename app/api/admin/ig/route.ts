import { NextRequest, NextResponse } from 'next/server';
import { createIgPost, getCronState, listIgPosts, listRoundImages, setRoundImage } from '@/lib/igPosts';
import { igConfigured, IG_CAROUSEL_MAX } from '@/lib/igPublish';

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
    const [posts, images, cron] = await Promise.all([
      listIgPosts(60), listRoundImages(), getCronState().catch(() => null),
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
      const caption = String(body?.caption || '').trim();
      if (!imageUrls.length || !caption) {
        return NextResponse.json({ error: 'imageUrl(s) と caption が必要です' }, { status: 400, headers: noStore });
      }
      if (imageUrls.length > IG_CAROUSEL_MAX) {
        return NextResponse.json(
          { error: `画像は${IG_CAROUSEL_MAX}枚までです` }, { status: 400, headers: noStore });
      }
      const post = await createIgPost({
        imageUrls, caption,
        roundId: String(body?.roundId || '').trim() || undefined,
        signature: String(body?.signature || '').trim() || undefined,
      });
      return NextResponse.json({ ok: true, post }, { headers: noStore });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400, headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
