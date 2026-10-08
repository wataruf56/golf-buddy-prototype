import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

const noStore = {
  'Cache-Control': 'no-store, must-revalidate',
  'Content-Type': 'application/json; charset=utf-8',
};

// GET /api/rounds/[id]/chat — group chat for approved participants
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  const round = await db.getRound(params.id);
  if (!round) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore });
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const [messages, threads] = await Promise.all([
    db.listRoundMessages(params.id),
    db.listRoundThreads(params.id),
  ]);
  return NextResponse.json({ messages, threads, round }, { headers: noStore });
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
  const allowed = round.hostId === meId || (round.applicantIds || []).includes(meId);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  const reqBody = await req.json();
  const { text } = reqBody;
  const threadId = reqBody?.threadId ? String(reqBody.threadId) : undefined;
  // 画像（リサイズ済みデータURL）。テキストが空でも画像があれば送信可。
  const imageUrl = (typeof reqBody?.imageUrl === 'string' && reqBody.imageUrl.startsWith('data:image/'))
    ? reqBody.imageUrl.slice(0, 1500000) : undefined;
  const trimmed = text ? String(text).trim() : '';
  if (!trimmed && !imageUrl) return NextResponse.json({ error: 'empty' }, { status: 400, headers: noStore });
  const message = await db.addRoundMessage(params.id, meId, trimmed, threadId, imageUrl);
  // 参加者への通知（メンション／ふつうのチャット）。管理画面からの発言と共通（lib/roundChatNotify）
  try {
    const { notifyRoundChat } = await import('@/lib/roundChatNotify');
    await notifyRoundChat(round, meId, (await db.getUser(meId))?.displayName || '参加者', trimmed, threadId);
  } catch (e) { console.warn('[round chat] notify failed', (e as Error).message); }
  return NextResponse.json({ message }, { headers: noStore });
}
