import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isRoundHost } from '@/lib/roundHost';
import { canAskHost, ensureQuestionThread, findQuestionThread, isRelatedToRound } from '@/lib/roundQuestion';

// 「❓ 主催者に質問」（募集のグループチャット内の非公開スレッド・lib/roundQuestion）（2026-10-13）
//   GET  /api/rounds/[id]/question
//        → { canAsk, threadId, dmAllowed: string[] }
//          canAsk     … 自分がこの募集で質問スレッドを立ててよいか（主催者は false）
//          threadId   … 自分の質問スレッド（あれば）
//          dmAllowed  … この募集に出てくる人のうち、1対1のDM（lib/dmPolicy）を送ってよい相手
//   POST /api/rounds/[id]/question { userId? }
//        → { ok, threadId, thread, created }
//          userId なし … 自分が質問する側としてスレッドを用意（あれば再利用）
//          userId あり … 主催者・共同管理者が、その人に向けたスレッドを用意（申請中・参加確定・招待中・空き待ち・取りやめた人）
const noStore = { 'Cache-Control': 'no-store, must-revalidate' };

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const threads = await db.listRoundThreads(params.id);
  const mine = findQuestionThread(threads, meId);
  const canAsk = !!mine || canAskHost(round, meId);
  const people = Array.from(new Set([
    round.hostId, ...(round.coHostIds || []), ...(round.applicantIds || []), ...(round.pendingApplicantIds || []),
    ...(round.invitedIds || []), ...(round.waitlist || []).map((w) => w.userId), ...(round.cancellations || []).map((c) => c.userId),
  ].filter((x): x is string => !!x && x !== meId)));
  let dmAllowed: string[] = [];
  try { const { dmAllowedSet } = await import('@/lib/dmPolicy'); dmAllowed = Array.from(await dmAllowedSet(meId, people)); } catch { /* 判定できなければ全員に❓を出す */ }
  return NextResponse.json({ canAsk, threadId: mine?.id || null, dmAllowed }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned, blockedByRestriction } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const rstChat = await blockedByRestriction(meId, 'noChat', 'チャットの利用が制限されています。'); if (rstChat) return rstChat;
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  let body: any = {};
  try { body = (await req.json()) || {}; } catch { /* noop */ }
  const target = typeof body.userId === 'string' && body.userId && body.userId !== meId ? String(body.userId) : '';

  if (target) {
    // 主催者側から、その人に向けたスレッドを立てる
    if (!isRoundHost(round, meId)) return NextResponse.json({ error: 'forbidden', message: '主催者・共同管理者だけが使えます' }, { status: 403, headers: noStore });
    if (isRoundHost(round, target)) return NextResponse.json({ error: 'bad_request', message: '主催者同士はグループチャットで話せます' }, { status: 400, headers: noStore });
    if (!isRelatedToRound(round, target)) return NextResponse.json({ error: 'bad_request', message: 'この募集に関わっている人にだけ連絡できます' }, { status: 400, headers: noStore });
    const { thread, created } = await ensureQuestionThread(round, target, meId);
    return NextResponse.json({ ok: true, threadId: thread.id, thread, created }, { headers: noStore });
  }

  const threads = await db.listRoundThreads(params.id);
  const mine = findQuestionThread(threads, meId);
  if (!mine && !canAskHost(round, meId)) {
    return NextResponse.json({ error: 'forbidden', message: isRoundHost(round, meId) ? '主催者はこの募集のグループチャットをご利用ください' : 'この募集には質問できません（募集が終了しています）' }, { status: 403, headers: noStore });
  }
  const { thread, created } = await ensureQuestionThread(round, meId, meId);
  return NextResponse.json({ ok: true, threadId: thread.id, thread, created }, { headers: noStore });
}
