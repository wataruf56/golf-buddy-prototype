import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushToMany, liffUrl } from '@/lib/linePush';
import { webPushToMany } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
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
  // Notify other participants. A user mentioned via "@名前" gets a mention
  // notification (gated on their "mention" pref); everyone else gets the
  // general round-chat notification (gated on "roundChat", off by default).
  const recipients = [round.hostId, ...(round.applicantIds || [])].filter((id) => id && id !== meId);
  if (recipients.length) {
    const me = await db.getUser(meId);
    const senderName = me?.displayName || '参加者';
    const preview = trimmed ? (trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed) : '📷 画像';
    const others = (await Promise.all(recipients.map((id) => db.getUser(id)))).filter(Boolean) as any[];

    // A recipient is "mentioned" if their display name appears after an @.
    const mentioned: any[] = [];
    const rest: any[] = [];
    for (const u of others) {
      const name = (u.displayName || '').trim();
      const isMentioned = name && (trimmed.includes('@' + name) || trimmed.includes('＠' + name));
      (isMentioned ? mentioned : rest).push(u);
    }

    // Always record mentions in the in-app inbox (home screen), even if LINE is
    // off. (General round-chat messages are intentionally NOT inboxed — they are
    // already surfaced by the in-app round-chat unread badge, and inboxing every
    // message would flood the お知らせ list.)
    // スレッド内の発言なら、そのスレッドへ直接飛べるよう ?thread= を付ける。
    const chatPath = `/round/${params.id}/chat${threadId ? `?thread=${encodeURIComponent(threadId)}` : ''}`;
    if (mentioned.length) {
      const { addNotificationMany } = await import('@/lib/notifications');
      addNotificationMany(
        mentioned.map((u) => u.id),
        'mention',
        `📣 ${senderName} さんが「${round.title}」のチャットであなたにメンションしました`,
        chatPath,
      ).catch(() => {});
    }

    const mentionTargets = mentioned.filter((u) => isNotifyEnabled(u, 'mention')).map((u) => u.id);
    if (mentionTargets.length) {
      pushToMany(mentionTargets, `📣 ${round.title}\n${senderName} さんがあなたをメンションしました\n${preview}`, liffUrl(chatPath)).catch(() => {});
      webPushToMany(mentionTargets, `📣 ${senderName} さんからメンション`, preview, chatPath, `mention-${params.id}`).catch(() => {});
    }

    // Everyone else (not mentioned) → general round-chat pref.
    const chatTargets = rest.filter((u) => isNotifyEnabled(u, 'roundChat')).map((u) => u.id);
    if (chatTargets.length) {
      pushToMany(chatTargets, `🏌️ ${round.title}\n${senderName}: ${preview}`, liffUrl(chatPath)).catch(() => {});
      webPushToMany(chatTargets, `🏌️ ${round.title}`, `${senderName}: ${preview}`, chatPath, `roundchat-${params.id}`).catch(() => {});
    }
  }
  return NextResponse.json({ message }, { headers: noStore });
}
