import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isAdminUserId } from '@/lib/adminAccess';
import {
  createThread, listActiveThreads, listThreads, officialOf, slotStates,
  takenSeats, totalSeats, isFilled, type OfficialPattern,
} from '@/lib/officialThread';
import type { Round } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store' };
export const dynamic = 'force-dynamic';

// 公式スレッド（運営が代理で立てる募集）。
//   GET  … 動いている枠と、自分が参加できるか。ホームの声かけと詳細で使う。
//          `?id=<roundId>` でその枠だけ。省略すると動いているものを全部返す。
//   POST … 作る（運営のみ・管理トークンでも可）。**同時に何本でも立てられる**
//          （2026-08-31。以前は1本まで。塞いでいたのは声かけ設定が全体で1組だった件）。

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

  // 一般：動いている枠。?id= が付いていればその1本だけ。
  const wantId = new URL(req.url).searchParams.get('id') || '';
  let actives = await listActiveThreads();
  if (wantId) actives = actives.filter((r) => r.id === wantId);
  if (!actives.length) {
    return NextResponse.json({ thread: null, threads: [] }, { headers: noStore });
  }

  const me = meId ? await db.getUser(meId) : null;

  // 参加者の名前は枠をまたいで1回で引く（枠ごとに引くと本数分だけ往復する）
  const allIds = Array.from(new Set(actives.flatMap((r) => r.applicantIds || [])));
  const users: Record<string, any> = {};
  try {
    (await db.listUsers(allIds)).forEach((u) => { if (u) users[u.id] = u; });
  } catch { /* 名前が出なくても枠は返す */ }

  const shape = (round: Round) => {
    const memberIds = round.applicantIds || [];
    const states = slotStates(round, users);
    const joined = !!meId && memberIds.includes(meId);

    // 誰が入っているかは、**集まるまで伏せる**。
    // 先に入った人の顔ぶれで参加を決められると、企画の狙い（横並びで手を挙げられる）が
    // 崩れるし、まだ入っていない人に会員の顔と名前を見せる理由もない。
    // 自分が入っていれば見える（入った時点でグループチャットに合流して分かるので、
    // ここだけ伏せても意味がない）。満席になったら全員に開く。
    const reveal = joined || isFilled(round);

    return {
      id: round.id, title: round.title, official: officialOf(round)!,
      taken: takenSeats(round), total: totalSeats(round),
      revealed: reveal,
      slots: states.map((s) => ({
        ...s.slot,
        // 伏せているあいだは userId も返さない（画面で隠しても応答に残っていたら同じこと）
        taken: reveal ? s.taken : [],
        takenCount: s.taken.length,
        left: s.left, drivers: s.drivers, driverOnly: s.driverOnly,
      })),
      members: reveal ? memberIds.map((id) => slim(users[id])).filter(Boolean) : [],
      // 誰かは伏せたまま、判断に要る「何人・うち車あり何人」だけは常に渡す。
      digest: {
        count: memberIds.length,
        withCar: memberIds.filter((id) => users[id]?.car === 'have').length,
      },
      joined,
    };
  };

  const threads = actives.map(shape);
  // thread（単数）は同時開催より前からある形。自分が入っている枠を優先して返す。
  const thread = threads.find((t) => t.joined) || threads[0];

  return NextResponse.json({
    threads, thread,
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
    // 枠ごとに声かけ文面を変えられる。省略なら既定のひな形をそのまま使う。
    prompt: body?.prompt && typeof body.prompt === 'object' ? body.prompt : undefined,
    // だいたいの開催時期（9月下旬・土日 など）。中身は createThread 側で整える。
    when: body?.when && typeof body.when === 'object' ? body.when : undefined,
  });
  if (!res.ok) return NextResponse.json({ ok: false, message: res.message }, { status: 409, headers: noStore });
  return NextResponse.json({ ok: true, id: res.round.id, title: res.round.title }, { headers: noStore });
}
