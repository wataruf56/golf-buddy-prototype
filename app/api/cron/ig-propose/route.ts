import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany } from '@/lib/linePush';
import { buildCaption, captionSignature } from '@/lib/igCaption';
import { createIgPost, getRoundImage, signatureExists } from '@/lib/igPosts';

// 募集中ラウンドから Instagram の「下書き」を作り、LINEで承認をお願いする。
//
// ★ここでは絶対に公開しない。作るのは status='draft' だけ。
//  公開は管理画面で人が押すか、人が予約した時刻に /api/cron/ig-publish-due が行う。
//
// 画像は事前に GCS へ上げて igImages/{roundId} に登録しておく方式（事前ストック方式）。
// 未登録のラウンドは投稿を作らず、LINEで「画像未登録」とだけ知らせる。
//
// Auth: Bearer CRON_SECRET / ?secret= （既存cronと同じ）

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

function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || 'https://app.goltomo.com').replace(/\/+$/, '');
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  try {
    const [open, official] = await Promise.all([
      db.listRounds({ status: 'open' }),
      db.listOfficialRounds().catch(() => [] as any[]),
    ]);
    const seen = new Set<string>();
    const rounds = [...open, ...official].filter((r: any) => {
      if (!r || seen.has(r.id) || r.status !== 'open') return false;
      seen.add(r.id);
      return true;
    });

    const created: string[] = [];
    const skipped: { id: string; why: string }[] = [];
    const needImage: { id: string; label: string }[] = [];

    for (const r of rounds as any[]) {
      const rest = Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
      const label = `${r.date || '日程未定'} ${r.courseName || r.venue || r.area || ''}`.trim();

      if (rest <= 0) { skipped.push({ id: r.id, why: '満枠' }); continue; }

      const sig = captionSignature(r.id, rest);
      if (await signatureExists(sig)) { skipped.push({ id: r.id, why: '提案済み' }); continue; }

      const imageUrl = await getRoundImage(r.id);
      if (!imageUrl) { needImage.push({ id: r.id, label }); continue; }

      const caption = buildCaption({ round: { ...r, isOfficial: !!r.isOfficial } });
      const post = await createIgPost({ roundId: r.id, imageUrl, caption, signature: sig });
      created.push(post.id);
    }

    const ids = adminIds();
    if (ids.length && (created.length || needImage.length)) {
      const lines: string[] = ['📷 Instagram投稿の下書きができました'];
      if (created.length) lines.push(`・下書き ${created.length}件（内容を確認して公開または予約してください）`);
      if (needImage.length) {
        lines.push(`・画像未登録 ${needImage.length}件`);
        for (const n of needImage.slice(0, 5)) lines.push(`　- ${n.label}`);
      }
      await pushToMany(ids, lines.join('\n'), `${baseUrl()}/admin/ig`, 'ig_propose');
    }

    return NextResponse.json(
      { ok: true, created: created.length, needImage, skipped },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
