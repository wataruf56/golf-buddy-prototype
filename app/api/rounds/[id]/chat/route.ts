import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge } from '@/lib/ageGate';
import { filterForViewer, findQuestionThread, isPrivateThread } from '@/lib/roundQuestion';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// GET /api/rounds/[id]/chat — group chat for approved participants
//   参加者（主催者・共同管理者・参加確定）… 本流＋公開スレッド＋自分が入っている非公開（質問）スレッド
//   参加者でない人 … 自分の「❓ 主催者に質問」スレッドがあれば、それだけを返す（limited:true・2026-10-13・lib/roundQuestion）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const participant = round.hostId === meId || (round.coHostIds || []).includes(meId) || (round.applicantIds || []).includes(meId);
  const [messages, threads] = await Promise.all([
    db.listRoundMessages(params.id),
    db.listRoundThreads(params.id),
  ]);
  // 配信用に整える（他の人の保留・取りやめの記録などを返さない・2026-10-13）
  const { stripRoundForViewer } = await import('@/lib/roundView');
  if (!participant) {
    const mine = findQuestionThread(threads, meId);
    if (!mine) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    const v = filterForViewer(threads, messages, meId, { onlyPrivate: true });
    return NextResponse.json({ messages: v.messages, threads: v.threads, round: stripRoundForViewer(round, meId), limited: true, questionThreadId: mine.id }, { headers: noStore });
  }
  const v = filterForViewer(threads, messages, meId);
  return NextResponse.json({ messages: v.messages, threads: v.threads, round: stripRoundForViewer(round, meId), limited: false }, { headers: noStore });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const { blockedIfBanned, blockedByRestriction } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const rstChat = await blockedByRestriction(meId, 'noChat', 'チャットの利用が制限されています。'); if (rstChat) return rstChat;
  const me = await db.getUser(meId);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403, headers: noStore });
  }
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const participant = round.hostId === meId || (round.coHostIds || []).includes(meId) || (round.applicantIds || []).includes(meId);
  const reqBody = await req.json();
  const { text } = reqBody;
  const threadId = reqBody?.threadId ? String(reqBody.threadId) : undefined;
  // スレッド宛てなら、そのスレッドを読める人か確かめる（非公開の質問スレッドは memberIds だけ）。
  // 参加者でない人は、自分の質問スレッド宛てだけ送れる（本流・公開スレッドには送れない）
  let thread: import('@/lib/types').RoundThread | undefined;
  if (threadId) {
    const threads = await db.listRoundThreads(params.id);
    thread = threads.find((t) => t.id === threadId);
    if (!thread) return NextResponse.json({ error: 'thread_not_found', message: 'このスレッドは見つかりません' }, { status: 404, headers: noStore });
    if (isPrivateThread(thread)) {
      if (!(thread.memberIds || []).includes(meId)) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    } else if (!participant) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }
  } else if (!participant) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }
  // 画像（リサイズ済みデータURL）。テキストが空でも画像があれば送信可。
  const imageUrl = (typeof reqBody?.imageUrl === 'string' && reqBody.imageUrl.startsWith('data:image/'))
    ? reqBody.imageUrl.slice(0, 1500000) : undefined;
  const trimmed = text ? String(text).trim() : '';
  if (!trimmed && !imageUrl) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });
  // 行ける日の部屋は、あいさつ（方面・予算・車・/api/rounds/[id]/room-intro）をしてから話す（2026-10-15 本人判断）。
  // この仕組みより前から話していた人（自分の発言がすでにある人）はそのまま話せる。
  if ((round as any).availDate && !((round as any).roomIntroDone || {})[meId]) {
    let spoke = false;
    try {
      const { getAdminDb } = await import('@/lib/firebase');
      const adb = getAdminDb() as any;
      if (adb) spoke = !(await adb.collection('rounds').doc(params.id).collection('chat').where('senderId', '==', meId).limit(1).get()).empty;
      else spoke = true;
    } catch { spoke = true; }   // 判定できなければ止めない
    if (!spoke) return NextResponse.json({ error: 'intro_required', message: 'まず、行きたい方面・予算・車を選んであいさつしてください' }, { status: 403, headers: noStore });
  }
  const message = await db.addRoundMessage(params.id, meId, trimmed, threadId, imageUrl);
  // 参加者への通知（メンション／ふつうのチャット）。管理画面からの発言と共通（lib/roundChatNotify）
  // 非公開の質問スレッドなら、そのスレッドの人（主催者⇄質問した人）だけに届く
  try {
    const { notifyRoundChat } = await import('@/lib/roundChatNotify');
    await notifyRoundChat(round, meId, me?.displayName || '参加者', trimmed, threadId, thread);
  } catch (e) { console.warn('[round chat] notify failed', (e as Error).message); }
  return NextResponse.json({ message }, { headers: noStore });
}
