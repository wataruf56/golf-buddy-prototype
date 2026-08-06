import { NextRequest, NextResponse } from 'next/server';
import { pushToMany } from '@/lib/linePush';
import { igPublishImage } from '@/lib/igPublish';
import { listDueScheduled, updateIgPost } from '@/lib/igPosts';

// 予約時刻を過ぎた投稿を公開する。
//
// ★公開されるのは status='scheduled' のものだけ。つまり「人が予約した投稿」だけ。
//  下書き(draft)は絶対に自動公開されない。
//
// Auth: Bearer CRON_SECRET / ?secret=

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

function authorize(req: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET || '').trim();
  if (!expected) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${expected}`) return true;
  return new URL(req.url).searchParams.get('secret') === expected;
}

function adminIds(): string[] {
  const raw = (process.env.ADMIN_NOTIFY_USER_IDS || process.env.ADMIN_USER_IDS || '').trim();
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  try {
    const due = await listDueScheduled();
    const done: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const p of due) {
      // 二重公開を防ぐため、走る前に publishing 相当へ落としておく。
      await updateIgPost(p.id, { status: 'published', publishedAt: Date.now(), error: null });
      try {
        const mediaId = await igPublishImage(p.imageUrl, p.caption);
        await updateIgPost(p.id, { igMediaId: mediaId });
        done.push(p.id);
      } catch (e) {
        await updateIgPost(p.id, {
          status: 'failed', publishedAt: null, error: (e as Error).message.slice(0, 500),
        });
        failed.push({ id: p.id, error: (e as Error).message.slice(0, 200) });
      }
    }

    const ids = adminIds();
    if (ids.length && (done.length || failed.length)) {
      const lines: string[] = [];
      if (done.length) lines.push(`✅ Instagramに${done.length}件投稿しました`);
      if (failed.length) {
        lines.push(`⚠️ ${failed.length}件が失敗しました`);
        for (const f of failed.slice(0, 3)) lines.push(`　- ${f.error}`);
      }
      await pushToMany(ids, lines.join('\n'), 'https://www.instagram.com/goltomo.golf/', 'ig_publish');
    }

    return NextResponse.json({ ok: true, published: done.length, failed }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
