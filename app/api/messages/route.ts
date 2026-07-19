import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMeId } from '@/lib/session';
import { pushTo, liffUrl } from '@/lib/linePush';
import { webPushText } from '@/lib/webPush';
import { isNotifyEnabled } from '@/lib/notifyPrefs';
import { isMatchingAllowedByAge } from '@/lib/ageGate';

export async function GET(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const chatId = url.searchParams.get('chatId');
  if (!chatId) return NextResponse.json({ chat: null });
  const chat = await db.getChat(chatId);
  if (!chat) return NextResponse.json({ chat: null });
  if (!chat.participants.includes(meId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await db.markChatRead(chatId, meId);
  return NextResponse.json({ chat });
}

export async function POST(req: NextRequest) {
  const meId = await getMeId();
  if (!meId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { blockedIfBanned, blockedByRestriction } = await import('@/lib/banGuard');
  const ban = await blockedIfBanned(meId); if (ban) return ban;
  const rstDM = await blockedByRestriction(meId, 'noDM', 'メッセージ送信の利用が制限されています。'); if (rstDM) return rstDM;
  const body = await req.json();
  const { chatId, text, otherUserId, imageUrl } = body || {};
  const msgText = typeof text === 'string' ? text : '';
  const img = typeof imageUrl === 'string' && imageUrl ? imageUrl : undefined;
  // テキスト または 画像 のどちらかがあればOK（ラウンドチャットと同仕様）。
  if (!chatId || !otherUserId || (!msgText.trim() && !img)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
  // Block enforcement: either side blocking the other prevents new messages.
  const [me, other] = await Promise.all([db.getUser(meId), db.getUser(otherUserId)]);
  if (!isMatchingAllowedByAge(me?.age)) {
    return NextResponse.json({ error: 'age_restricted', message: '20〜30代の方のみご利用いただけます' }, { status: 403 });
  }
  const meBlocksOther = (me?.blockedUserIds || []).includes(otherUserId);
  const otherBlocksMe = (other?.blockedUserIds || []).includes(meId);
  if (meBlocksOther) return NextResponse.json({ error: 'blocked_by_self' }, { status: 403 });
  if (otherBlocksMe) return NextResponse.json({ error: 'blocked_by_other' }, { status: 403 });
  const participants: [string, string] = [meId, otherUserId].sort() as [string, string];
  const message = await db.sendMessage(chatId, participants, meId, msgText.trim(), img);
  // Always record in the in-app inbox (home screen), even if LINE is off.
  const senderName = me?.displayName || 'ゴル友';
  const previewSrc = msgText.trim() || (img ? '📷 画像を送信しました' : '');
  const preview = previewSrc.length > 60 ? previewSrc.slice(0, 60) + '…' : previewSrc;
  const dmLink = `/chat/${chatId}?other=${meId}`;
  const { renderNotif } = await import('@/lib/notificationTemplateStore');
  const n = await renderNotif('dm', { '送信者名': senderName, '本文': preview });
  {
    const { addNotification } = await import('@/lib/notifications');
    if (n.inApp) addNotification(otherUserId, 'dm', n.inApp, dmLink).catch(() => {});
  }
  // Fire-and-forget LINE + web push, gated on the recipient's "dm" preference.
  if (isNotifyEnabled(other as any, 'dm')) {
    pushTo(otherUserId, n.line, liffUrl(dmLink)).catch(() => {});
    webPushText(otherUserId, n.webTitle, n.webBody, dmLink, `chat-${chatId}`).catch(() => {});
  }
  return NextResponse.json({ message });
}
