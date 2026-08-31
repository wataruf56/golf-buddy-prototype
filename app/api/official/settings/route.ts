import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import { getSettings, promptFrom, saveSettings } from '@/lib/officialSettings';
import { listActiveThreads, officialOf, promptMatches, takenSeats, totalSeats } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

function adminToken(req: NextRequest): boolean {
  const t = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && t === expected;
}

// GET  ?for=home … ホームに声かけを出すか（対象条件に合う人にだけ）
// GET            … 設定そのもの（運営のみ）
// POST           … 設定を保存（運営のみ）
export async function GET(req: NextRequest) {
  const meId = await getMeId();
  const url = new URL(req.url);

  if (url.searchParams.get('for') === 'home') {
    if (!meId) return NextResponse.json({ show: false, prompts: [] }, { headers: noStore });

    // 同時開催に対応（2026-08-31）。動いている枠を全部見て、
    // **その枠自身の声かけ設定**で自分が対象かを判定する。
    const [actives, me, fallback] = await Promise.all([
      listActiveThreads(), db.getUser(meId), getSettings(),
    ]);

    const prompts = actives.flatMap((round) => {
      const o = officialOf(round)!;
      // 募集中で、まだ空きがあって、自分が入っていないときだけ声をかける。
      if (o.stage !== 'recruiting') return [];
      if ((round.applicantIds || []).includes(meId)) return [];
      const taken = takenSeats(round); const total = totalSeats(round);
      if (taken >= total) return [];
      // 同時開催より前に立てた枠は prompt を持たないので、既定のひな形で補う。
      const pr = o.prompt || promptFrom(fallback);
      if (!promptMatches(pr, me as any)) return [];
      return [{
        show: true, id: round.id, title: pr.popupTitle, body: pr.popupBody,
        // 声かけの見た目も企画で変える（女性だけの枠は桜色）
        pattern: o.pattern,
        left: total - taken, total, snoozeDays: pr.snoozeDays,
        // 管理者の代理ラウンド募集（ドライバー先行）の枠かどうか。
        // こちらは「予定が合えば行きたい」のワンタップで、枠を選ばせずに
        // そのままチャットへ入れる。手で立てた meetup 枠とは導線が違う。
        proxy: !!(o.driverId || (o.stations && o.stations.length)),
        stations: o.stations || [],
      }];
    });

    // prompts（複数）が本体。top-level は同時開催より前からある形なので残す。
    return NextResponse.json(
      prompts.length ? { ...prompts[0], prompts } : { show: false, prompts: [] },
      { headers: noStore },
    );
  }

  if (!adminToken(req) && !isAdminUserId(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  return NextResponse.json({ settings: await getSettings() }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!adminToken(req) && !isAdminUserId(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const settings = await saveSettings(body || {});
  return NextResponse.json({ ok: true, settings }, { headers: noStore });
}
