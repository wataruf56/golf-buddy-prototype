import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import { officialOf, type OfficialInfo } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 運営が立てた枠の後始末（運営のみ）。同時に走らせるのは1本までなので、
// 出しっぱなしの枠を畳めないと次が立てられない。ここがその出口。
//
//   POST   {action:'close'} … 閉じる（履歴には残す。参加者がいるときはこちら）
//   DELETE                  … 消す（間違えて立てた枠。参加者がいたら断る）

function adminToken(req: NextRequest): boolean {
  const t = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && t === expected;
}

async function guard(req: NextRequest, id: string) {
  const meId = await getMeId();
  if (!adminToken(req) && !isAdminUserId(meId)) {
    return { err: NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore }) };
  }
  const round = await db.getRound(id);
  if (!round) return { err: NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore }) };
  const o = officialOf(round);
  if (!o || round.hostId !== ADMIN_MANAGER_ID) {
    return { err: NextResponse.json({ error: 'not_official' }, { status: 400, headers: noStore }) };
  }
  return { round, o };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { round, o, err } = await guard(req, params.id) as any;
  if (err) return err;
  const next: OfficialInfo = { ...o, stage: 'closed' };
  await db.updateRound(round.id, { official: next, status: 'closed' } as any);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { round, err } = await guard(req, params.id) as any;
  if (err) return err;
  const members = (round.applicantIds || []).filter((x: string) => x !== ADMIN_MANAGER_ID);
  if (members.length) {
    return NextResponse.json(
      { ok: false, message: `${members.length}人が参加しています。削除ではなく「閉じる」を使ってください。` },
      { status: 409, headers: noStore },
    );
  }
  await db.deleteRound(round.id);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
