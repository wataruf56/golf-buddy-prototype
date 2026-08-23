import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import { getSettings, matchesTarget, saveSettings } from '@/lib/officialSettings';
import { getActiveThread, officialOf, takenSeats, totalSeats } from '@/lib/officialThread';

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
    if (!meId) return NextResponse.json({ show: false }, { headers: noStore });
    const round = await getActiveThread();
    if (!round) return NextResponse.json({ show: false }, { headers: noStore });
    const o = officialOf(round)!;
    // 募集中で、まだ空きがあって、自分が入っていないときだけ声をかける。
    if (o.stage !== 'recruiting') return NextResponse.json({ show: false }, { headers: noStore });
    if ((round.applicantIds || []).includes(meId)) return NextResponse.json({ show: false }, { headers: noStore });

    const [s, me] = await Promise.all([getSettings(), db.getUser(meId)]);
    if (!matchesTarget(s, me as any)) return NextResponse.json({ show: false }, { headers: noStore });

    const taken = takenSeats(round); const total = totalSeats(round);
    if (taken >= total) return NextResponse.json({ show: false }, { headers: noStore });

    return NextResponse.json({
      show: true, id: round.id, title: s.popupTitle, body: s.popupBody,
      left: total - taken, total, snoozeDays: s.snoozeDays,
    }, { headers: noStore });
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
