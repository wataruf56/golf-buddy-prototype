import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import {
  createThread, getActiveThread, listThreads, officialOf, slotStates,
  takenSeats, totalSeats, type OfficialPattern,
} from '@/lib/officialThread';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 公式スレッド（運営が代理で立てる募集）。
//   GET  … いま動いている1本＋自分が参加できるか。ホームの声かけと詳細で使う。
//   POST … 作る（運営のみ・管理トークンでも可）。**同時に走らせるのは1本まで**。

function adminToken(req: NextRequest): boolean {
  const t = new URL(req.url).searchParams.get('token') || '';
  const expected = process.env.ADMIN_LOG_TOKEN || '';
  return !!expected && t === expected;
}

const slim = (u: any) => u ? ({
  id: u.id, displayName: u.displayName, avatar: u.avatar, avatarUrl: u.avatarUrl,
  avatarMode: u.avatarMode, color: u.color, gender: u.gender, car: u.car, age: u.age,
}) : null;

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  const all = new URL(req.url).searchParams.get('all') === '1';

  // 管理画面：全件（動いているもの＋終わったもの）
  if (all) {
    if (!adminToken(req) && !isAdminUserId(meId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }
    const threads = await listThreads();
    return NextResponse.json({
      threads: threads.map((r) => ({
        id: r.id, title: r.title, createdAt: r.createdAt,
        official: officialOf(r), taken: takenSeats(r), total: totalSeats(r),
      })),
    }, { headers: noStore });
  }

  // 一般：いま動いている1本
  const round = await getActiveThread();
  if (!round) return NextResponse.json({ thread: null }, { headers: noStore });

  const o = officialOf(round)!;
  const memberIds = round.applicantIds || [];
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(memberIds)).forEach((u) => { if (u) users[u.id] = u; });
  } catch { /* 名前が出なくても枠は返す */ }

  const me = meId ? await db.getUser(meId) : null;
  const states = slotStates(round, users);

  return NextResponse.json({
    thread: {
      id: round.id, title: round.title, official: o,
      taken: takenSeats(round), total: totalSeats(round),
      slots: states.map((s) => ({
        ...s.slot, taken: s.taken, left: s.left, drivers: s.drivers, driverOnly: s.driverOnly,
      })),
      members: memberIds.map((id) => slim(users[id])).filter(Boolean),
      joined: !!meId && memberIds.includes(meId),
    },
    me: me ? { id: me.id, gender: me.gender, car: me.car } : null,
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!adminToken(req) && !isAdminUserId(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }

  const pattern: OfficialPattern = body?.pattern === 'meetup' ? 'meetup' : 'women';
  const res = await createThread({
    pattern,
    title: body?.title ? String(body.title) : undefined,
    meetPlace: body?.meetPlace ? String(body.meetPlace) : undefined,
    slots: Array.isArray(body?.slots) ? body.slots : undefined,
    askLicense: body?.askLicense,
    expireDays: Number(body?.expireDays) || undefined,
  });
  if (!res.ok) return NextResponse.json({ ok: false, message: res.message }, { status: 409, headers: noStore });
  return NextResponse.json({ ok: true, id: res.round.id, title: res.round.title }, { headers: noStore });
}
