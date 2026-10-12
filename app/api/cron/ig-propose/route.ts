import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushToMany } from '@/lib/linePush';
import {
  buildCaption, buildFullCaption, buildAltText, captionSignature, fullSignature, GenderMix,
} from '@/lib/igCaption';
import {
  createIgPost, deleteIgPost, getRoundImage, listUnpublished, signatureExists,
} from '@/lib/igPosts';
import { countedMemberIds } from '@/lib/hostCount';

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
  const ids: string[] = countedMemberIds(r); // 公式募集は主催者を数えない（2026-10-12）
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
      // 「◯日に行ける人」の部屋（lib/availRooms.ts・availDate つき）はラウンドではない。
      // 部屋は maxSpots を常に参加人数と同じにするので、人が入った瞬間に「満員」と
      // 判定され、コースも時間も無い満員告知の下書きが毎晩作られていた。
      if (r.availDate || String(r.id).startsWith('avail_')) return false;
      seen.add(r.id);
      return true;
    });

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // ------------------------------------------------------------------ 掃除
    //
    // 募集は毎日動く。昨日作った下書きは、今日にはもう嘘になっていることがある。
    // 「10/11 あと2名」の下書きが残っているあいだに満員になり、そのまま予約時刻を
    // 迎えて間違った数字で公開される、という事故が実際に起きた（2026-10）。
    //
    // そこで、まだ公開していない下書き・予約のうち、
    //   ・ラウンドがもう無い（消された）
    //   ・開催日が過ぎた
    //   ・いまの状態から作るはずの指紋と違う（＝残り枠が変わった／満員になった）
    // ものは、ここで消す。消したぶんは、このあとのループが最新の内容で作り直す。
    // 公開済みは記録なので絶対に触らない（listUnpublished が除いている）。
    const byId = new Map<string, any>(rounds.map((r: any) => [r.id, r]));
    const removed: { id: string; why: string }[] = [];
    for (const p of await listUnpublished().catch(() => [])) {
      const rid = p.roundId;
      if (!rid) continue;                       // カルーセルなど、ラウンドに紐づかないものは対象外
      const r = byId.get(rid);
      let why = '';
      if (!r) why = '募集が無くなった';
      else if (String(r.date || '').slice(0, 10) && String(r.date).slice(0, 10) < today) why = '開催日が過ぎた';
      else {
        const nowRest = Math.max(0, (r.maxSpots || 0) - (r.currentCount || 0));
        const want = nowRest <= 0 ? fullSignature(rid) : captionSignature(rid, nowRest);
        if (p.signature && p.signature !== want) why = `内容が変わった（${p.signature} → ${want}）`;
      }
      if (!why) continue;
      await deleteIgPost(p.id).catch(() => {});
      removed.push({ id: p.id, why });
    }


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
      // 日程調整中（dateType='range'）は日付が決まっていないので画像が作れない。
      // 毎日「画像なし」と通知しても直しようがないため、静かに飛ばす。
      if (!roundDate) { skipped.push({ id: r.id, why: '日程未定' }); continue; }

      const img = await getRoundImage(r.id);
      if (!img) { needImage.push({ id: r.id, label }); continue; }

      // ---------------------------------------------------------- 満員
      if (rest <= 0) {
        const sig = fullSignature(r.id);
        if (await signatureExists(sig)) { skipped.push({ id: r.id, why: '満員（提案済み）' }); continue; }
        if (!img.fullImageUrl) { needImage.push({ id: r.id, label: `${label}（満員用の画像）` }); continue; }
        const mix = await genderMix(r);
        const capInput = { round: { ...r, isOfficial: !!r.isOfficial }, mix,
                           note: img.note || undefined };
        const post = await createIgPost({
          roundId: r.id, imageUrl: img.fullImageUrl,
          caption: buildFullCaption(capInput),
          // 空のまま公開されないよう、画像に焼かれた文字から下書きしておく。
          // 背景写真の中身は /admin/ig で画像を見ながら足す。
          altTexts: [buildAltText(capInput, { full: true })],
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
      const capInput = { round: { ...r, isOfficial: !!r.isOfficial }, mix,
                         note: img.note || undefined };
      const post = await createIgPost({
        roundId: r.id, imageUrl: img.imageUrl,
        caption: buildCaption(capInput),
        // 同上。代替テキストが空の下書きを作らない。
        altTexts: [buildAltText(capInput)],
        signature: sig,
      });
      created.push(post.id);
    }

    // 毎日18時に走る。何も起きていない日は通知しない
    // （毎日同じ文面が届くと、そのうち読まれなくなるため）。
    const ids = adminIds();
    const made = created.length + createdFull.length;
    if (ids.length && (made || removed.length || needImage.length || staleImage.length)) {
      const lines: string[] = [];
      if (made) {
        lines.push(`📷 下書きが${made}件できました`);
        if (created.length) lines.push(`・募集 ${created.length}件`);
        if (createdFull.length) lines.push(`・満員 ${createdFull.length}件`);
      } else {
        lines.push('📷 今日は下書きを作れませんでした');
      }
      if (removed.length) {
        lines.push(`🧹 古くなった下書きを${removed.length}件消しました`);
      }
      if (needImage.length || staleImage.length) {
        lines.push('');
        lines.push('画像を作り直してください');
        for (const n of needImage.slice(0, 5)) lines.push(`　- ${n.label}（画像なし）`);
        for (const n of staleImage.slice(0, 5)) lines.push(`　- ${n.label}（${n.why}）`);
        lines.push('　make_round_images.py --apply');
      }
      await pushToMany(ids, lines.join('\n'), `${baseUrl()}/admin/ig`, 'ig_propose');
    }

    return NextResponse.json(
      { ok: true, created: created.length, full: createdFull.length,
        removed, needImage, staleImage, skipped },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
