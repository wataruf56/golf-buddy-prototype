import { NextRequest, NextResponse } from 'next/server';
import { pushToMany } from '@/lib/linePush';
import { advancePublish } from '@/lib/igRunPublish';
import { isIgAccessError } from '@/lib/igPublish';
import {
  IgPost, listDueScheduled, listPublishing, recordCronRun, recordIgBlocked, updateIgPost,
} from '@/lib/igPosts';

// 予約時刻を過ぎた投稿を公開する。
//
// ★公開されるのは status='scheduled' のものだけ。つまり「人が予約した投稿」だけ。
//  下書き(draft)は絶対に自動公開されない。
//
// リールは動画の変換待ちで1回では終わらないことがある。その場合は
// status='publishing' のまま残るので、次の巡回で続きをやる。
//
// Auth: Bearer CRON_SECRET / ?secret=

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

/** 変換待ちがこれ以上続いたら諦める。 */
const STUCK_MS = 40 * 60 * 1000;

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
    // 変換待ちの続き → 新しく時刻が来たもの、の順に処理する。
    const [stalled, due] = await Promise.all([listPublishing(), listDueScheduled()]);
    const targets = [...stalled, ...due];

    const done: string[] = [];
    const pending: string[] = [];
    const failed: { id: string; error: string }[] = [];
    let blocked = '';        // Instagram に繋がらない。予約は消さずに残す

    for (const p of targets) {
      // 変換待ちが長すぎるものは失敗にして、無限に居座らせない。
      if (p.status === 'publishing' && p.containerAt && Date.now() - p.containerAt > STUCK_MS) {
        await updateIgPost(p.id, {
          status: 'failed', containerId: null, containerAt: null,
          error: '動画の変換が終わりませんでした。動画を確認してやり直してください',
        });
        failed.push({ id: p.id, error: '動画の変換が終わりませんでした' });
        continue;
      }

      // 二重公開を防ぐため、走る前に publishing へ落としておく。
      if (p.status !== 'publishing') await updateIgPost(p.id, { status: 'publishing', error: null });

      try {
        const r = await advancePublish({ ...p, status: 'publishing' } as IgPost);
        if (r.state === 'published') {
          await updateIgPost(p.id, {
            status: 'published', publishedAt: Date.now(),
            igMediaId: r.mediaId, containerId: null, containerAt: null, error: null,
          });
          done.push(p.id);
        } else {
          pending.push(p.id);   // publishing のまま。次の巡回で続きをやる
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (isIgAccessError(e)) {
          // 投稿の中身は悪くない。接続が戻れば同じ内容で通るので、予約のまま戻す。
          blocked = msg;
          await updateIgPost(p.id, {
            status: p.status === 'publishing' ? 'scheduled' : p.status,
            containerId: null, containerAt: null, error: msg.slice(0, 500),
          });
          break;   // 全部同じ理由で落ちるので、これ以上叩かない
        }
        await updateIgPost(p.id, {
          status: 'failed', publishedAt: null, containerId: null, containerAt: null,
          error: msg.slice(0, 500),
        });
        failed.push({ id: p.id, error: msg.slice(0, 200) });
      }
    }

    await recordIgBlocked(blocked || null);

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

    await recordCronRun(null);
    return NextResponse.json(
      { ok: true, published: done.length, pending: pending.length, failed, blocked: blocked || null },
      { headers: noStore },
    );
  } catch (e) {
    // 落ちたことに気づけるよう、ログと Firestore の両方に残す。
    // LINE通知にしないのは、5分ごとなので月間の配信上限を食い潰すため。
    const msg = (e as Error).message;
    console.error('[ig-publish-due] failed:', msg);
    await recordCronRun(msg.slice(0, 500)).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
