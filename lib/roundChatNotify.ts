import 'server-only';
import { db } from './db';
import { pushToMany, liffUrl } from './linePush';
import { webPushToMany } from './webPush';
import { isNotifyEnabled } from './notifyPrefs';
import type { Round } from './types';

// ラウンドのグループチャットに発言があったときの通知（2026-10-08 に chat/route.ts から切り出し）。
// 参加者の発言と、管理画面から「管理人」として発言したときの両方で使う。
export async function notifyRoundChat(round: Round, senderId: string, senderName: string, trimmed: string, threadId?: string): Promise<void> {
  // Notify other participants. A user mentioned via "@名前" gets a mention
  // notification (gated on their "mention" pref); everyone else gets the
  // general round-chat notification (gated on "roundChat", off by default).
  const recipients = [round.hostId, ...(round.applicantIds || [])].filter((id) => id && id !== senderId);
  if (recipients.length) {
    const preview = trimmed ? (trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed) : '📷 画像';
    const others = (await Promise.all(recipients.map((id) => db.getUser(id)))).filter(Boolean) as any[];

    // A recipient is "mentioned" if their display name appears after an @.
    // 「@全員」（＠全員）が入っていれば、参加者全員をメンション扱いにする。
    const mentionAll = trimmed.includes('@全員') || trimmed.includes('＠全員');
    const mentioned: any[] = [];
    const rest: any[] = [];
    for (const u of others) {
      const name = (u.displayName || '').trim();
      const isMentioned = mentionAll || (name && (trimmed.includes('@' + name) || trimmed.includes('＠' + name)));
      (isMentioned ? mentioned : rest).push(u);
    }

    // Always record mentions in the in-app inbox (home screen), even if LINE is
    // off. (General round-chat messages are intentionally NOT inboxed — they are
    // already surfaced by the in-app round-chat unread badge, and inboxing every
    // message would flood the お知らせ list.)
    // スレッド内の発言なら、そのスレッドへ直接飛べるよう ?thread= を付ける。
    const chatPath = `/round/${round.id}/chat${threadId ? `?thread=${encodeURIComponent(threadId)}` : ''}`;
    const { renderNotif } = await import('@/lib/notificationTemplateStore');
    if (mentioned.length) {
      const nm = await renderNotif('mention', { '発言者名': senderName, '募集タイトル': round.title, '本文': preview });
      const { addNotificationMany } = await import('@/lib/notifications');
      if (nm.inApp) addNotificationMany(mentioned.map((u) => u.id), 'mention', nm.inApp, chatPath).catch(() => {});
      const mentionTargets = mentioned.filter((u) => isNotifyEnabled(u, 'mention')).map((u) => u.id);
      if (mentionTargets.length) {
        pushToMany(mentionTargets, nm.line, liffUrl(chatPath), 'mention').catch(() => {});
        webPushToMany(mentionTargets, nm.webTitle, nm.webBody, chatPath, `mention-${round.id}`).catch(() => {});
      }
    }

    // Everyone else (not mentioned) → general round-chat pref.
    const chatTargets = rest.filter((u) => isNotifyEnabled(u, 'roundChat')).map((u) => u.id);
    if (chatTargets.length) {
      const nc = await renderNotif('roundChat', { '募集タイトル': round.title, '発言者名': senderName, '本文': preview });
      pushToMany(chatTargets, nc.line, liffUrl(chatPath), 'chat').catch(() => {});
      webPushToMany(chatTargets, nc.webTitle, nc.webBody, chatPath, `roundchat-${round.id}`).catch(() => {});
    }
  }
}
