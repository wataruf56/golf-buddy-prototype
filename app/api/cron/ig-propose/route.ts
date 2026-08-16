import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany } from '@/lib/linePush';
import {
  buildCaption, buildFullCaption, captionSignature, fullSignature, GenderMix,
} from '@/lib/igCaption';
import { createIgPost, getRoundImage, signatureExists } from '@/lib/igPosts';

// 募集中ラウンドから Instagram の「下書き」を作り、LINEで承認をお願いする。
//
// 2種類つくる:
//   ・空きあり … 残り枠と男女内訳を出して募集する
//   ・満員     … 「満員」と入れて、埋まっていることを外から見えるようにする
//                （1ラウンドにつき1回だけ。指紋は roundId:full）
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

/** 参加確定メンバーの男女内訳。components/RoundCard.tsx と同じ数え方に合わせる
 *  （主催者＋承認済み＋知り合い枠 externalMale/externalFemale）。 */
async function genderMix(r: any): Promise<GenderMix> {
  let male = r.externalMale || 0;
  let female = r.externalFemale || 0;
  const ids: string[] = [r.hostId, ...(r.applicantIds || [])].filter(Boolean);
  if (ids.length) {
    const users = await db.listUsers(ids).catch(() => [] as any[]);
    for (const id of ids) {
      const u = users.find((x: any) => x.id === id);
      if (u?.gender === 'male') male++;
      else if (u?.gender === 'female') female++;
    }
  }
  return { male, female };
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

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const created: string[] = [];
    const createdFull: string[] = [];
    const skipped: { id: string; why: string }[] = [];
    const needImage: { id: string; label: string }[] = [];
    const staleImage: { id: string; label: string; why: string }[] = [];

    for (const r of rounds as any[]) {
      const rest = Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
      const label = `${r.date || '日程未定'} ${r.courseName || r.venue || r.area || ''}`.trim();
      const roundDate = String(r.date || '').slice(0, 10);

      // 終わった日程は出さない。
      if (roundDate && roundDate < today) { skipped.push({ id: r.id, why: '日程が過ぎている' }); continue; }

      const img = await getRoundImage(r.id);
      if (!img) { needImage.push({ id: r.id, label }); continue; }

      // ---------------------------------------------------------- 満員
      if (rest <= 0) {
        const sig = fullSignature(r.id);
        if (await signatureExists(sig)) { skipped.push({ id: r.id, why: '満員（提案済み）' }); continue; }
        if (!img.fullImageUrl) { needImage.push({ id: r.id, label: `${label}（満員用の画像）` }); continue; }
        const mix = await genderMix(r);
        const post = await createIgPost({
          roundId: r.id, imageUrl: img.fullImageUrl,
          caption: buildFullCaption({ round: { ...r, isOfficial: !!r.isOfficial }, mix }),
          signature: sig,
        });
        createdFull.push(post.id);
        continue;
      }

      // ---------------------------------------------------------- 空きあり
      const sig = captionSignature(r.id, rest);
      if (await signatureExists(sig)) { skipped.push({ id: r.id, why: '提案済み' }); continue; }

      // 画像に焼かれた日付・残り枠が今の内容と違うなら、投稿を作らない。
      // 本文だけ正しくて画像が古い、という食い違いを防ぐ。
      if (img.imageDate && roundDate && img.imageDate !== roundDate) {
        staleImage.push({ id: r.id, label, why: `画像は${img.imageDate}` });
        continue;
      }
      if (typeof img.imageRest === 'number' && img.imageRest !== rest) {
        staleImage.push({ id: r.id, label, why: `画像は残り${img.imageRest}名／いまは残り${rest}名` });
        continue;
      }

      const mix = await genderMix(r);
      const post = await createIgPost({
        roundId: r.id, imageUrl: img.imageUrl,
        caption: buildCaption({ round: { ...r, isOfficial: !!r.isOfficial }, mix }),
        signature: sig,
      });
      created.push(post.id);
    }

    const ids = adminIds();
    if (ids.length && (created.length || createdFull.length || needImage.length || staleImage.length)) {
      const lines: string[] = ['📷 Instagram投稿の下書きができました'];
      if (created.length) lines.push(`・募集 ${created.length}件`);
      if (createdFull.length) lines.push(`・満員のお知らせ ${createdFull.length}件`);
      if (needImage.length) {
        lines.push(`・画像未登録 ${needImage.length}件`);
        for (const n of needImage.slice(0, 5)) lines.push(`　- ${n.label}`);
      }
      if (staleImage.length) {
        lines.push(`・画像が古い ${staleImage.length}件（作り直してください）`);
        for (const n of staleImage.slice(0, 5)) lines.push(`　- ${n.label}（${n.why}）`);
      }
      await pushToMany(ids, lines.join('\n'), `${baseUrl()}/admin/ig`, 'ig_propose');
    }

    return NextResponse.json(
      { ok: true, created: created.length, full: createdFull.length, needImage, staleImage, skipped },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
