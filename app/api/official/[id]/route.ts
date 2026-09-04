import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import { ADMIN_MANAGER_ID } from '@/lib/adminManagerId';
import { officialOf, normalizeWhen, whenDateRange, type OfficialInfo } from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 運営が立てた枠の後始末と手直し（運営のみ）。
//
//   POST   （本文なし）     … 閉じる（履歴には残す。参加者がいるときはこちら）
//   PATCH  {when:{...}}     … だいたいの開催時期を後から直す
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

/**
 * 走っている枠の「だいたいの開催時期」を後から直す。
 *
 * 立て直しでは済まない。参加者もチャットもそのまま残したいので、
 * 中身だけ差し替えられる口が要る。
 * 一覧カードの日付欄（dateRange）も一緒に書き換える。ここを直さないと
 * 募集カードには新しい時期が出るのに一覧は古いままになる。
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { round, o, err } = await guard(req, params.id) as any;
  if (err) return err;
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  const when = normalizeWhen(body?.when);
  if (!when) {
    return NextResponse.json({ ok: false, message: '開催時期の指定が正しくありません' },
      { status: 400, headers: noStore });
  }
  const next: OfficialInfo = { ...o, when };
  await db.updateRound(round.id, { official: next, dateRange: whenDateRange(when) } as any);
  return NextResponse.json({ ok: true, when }, { headers: noStore });
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
