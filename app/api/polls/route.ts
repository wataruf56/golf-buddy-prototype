import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import type { SchedulePoll, ScheduleOption } from '@/lib/types';

const noStore = { 'Cache-Control': 'no-store' };
const MAX_OPTIONS = 30;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
function clean<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

// POST /api/polls — 新しい日程調整ポールを作成（ログイン必須）。
// body: { title?, options?: [{ date, startTime? }] }
export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized', message: 'ログインが必要です' }, { status: 401, headers: noStore });

  let body: any = {};
  try { body = (await req.json()) || {}; } catch {}

  const title = body.title ? String(body.title).trim().slice(0, 60) : undefined;
  const built: ScheduleOption[] = [];
  for (const o of (Array.isArray(body.options) ? body.options : []).slice(0, MAX_OPTIONS)) {
    const date = String(o?.date || '').trim().slice(0, 40);
    if (!date) continue;
    const startTime = o?.startTime ? String(o.startTime).trim().slice(0, 20) : undefined;
    built.push(clean({ id: genId('sopt'), date, startTime, createdBy: meId, createdAt: Date.now() }));
  }

  const poll: Omit<SchedulePoll, 'id'> = clean({
    ownerId: meId,
    title,
    createdAt: Date.now(),
    options: built,
    responses: [],
    decidedOptionId: null,
  });

  try {
    const created = await db.createPoll(poll);
    return NextResponse.json({ poll: created }, { headers: noStore });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[/api/polls POST] failed', msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
